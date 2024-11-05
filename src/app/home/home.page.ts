import { Component, ElementRef, Input, ViewChild, ChangeDetectorRef } from '@angular/core';
import { ModalController, ToastController, AlertController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { FirestoreService } from '../services/firestore.service';
import { Storage } from '@ionic/storage-angular';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { SwUpdate, VersionEvent, VersionReadyEvent } from '@angular/service-worker';
import { BUILD_VERSION } from '../../environments/build-version';
import { from, interval } from 'rxjs';
import { Activity, ActivityType } from '../models/activity.model';
import { IsoToLocalDate, LocalISODatetimeString, calculateBabyAge, formatHours, getCurrentLocalISODateTime, toLocalISODatetimeString } from '../utils/iso-date-time';
import { Chart } from 'chart.js/auto';
import { Clipboard } from '@angular/cdk/clipboard';
import { LLMService } from '../services/llm.service';

import { PwaService } from '../services/pwa.service';

import { ISession } from '../models/session.model';
import { ChatComponent } from '../modals/chat/chat.component';
import { use } from 'marked';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {

  today: Date = new Date();
  loadingInsights: boolean = false;
  loadingActivities: boolean = false;

  newEmptyActivity(): Activity {
    return {
      id: '',
      type: ActivityType.Feed,
      amount: 0,
      createdate_localisodatetimestring: getCurrentLocalISODateTime(),
      note: '',
    };
  }

  // Array to store all activities
  activities: Activity[] = [];
  groupedActivities: { date: string, activities: Activity[] }[] = [];

  // 24 hr stats
  totalFeeds_24hrs: number = 0;  // Total amount of feeds in the last 24 hours
  numberOfFeeds_24hrs: number = 0; // Number of feeds in the last 24 hours
  avgAmountPerFeed_24hrs: number = 0; // Average amount per feed in the last 24 hours
  hours_since_last_activity_string: string = "";

  // daily stats
  totalFeeds_today: number = 0;  // Total amount of feeds
  numberOfFeeds_today: number = 0; // Number of feeds
  avgAmountPerFeed_today: number = 0; // Average amount per feed

  sessionId!: string;

  insights!: string;

  version = BUILD_VERSION;

  // baby information
  babyname: string = "";
  babybirthdate: LocalISODatetimeString = "";
  babyage: string = "";
  babyweight_kg: number = -1;
  amount_required_per_day: number = -1;
  user_prompt_override: string = "";
  additional_system_instructions: string = "";

  // charts
  chart: Chart | undefined;

  // Model selection
  useModelFrom: string = 'openai';

  // llm prompts
  LLM_system_instructions: string = '';
  LLM_prompt: string = '';

  constructor(
    private toastController: ToastController,
    private route: ActivatedRoute,
    private router: Router,
    private firestoreService: FirestoreService,
    private storage: Storage, // Inject Storage
    private http: HttpClient,
    private swUpdate: SwUpdate,
    private modalController: ModalController,
    public pwaService: PwaService,
    private alertCtrl: AlertController, // Inject AlertController
    private clipboard: Clipboard,
    private llmService: LLMService,
  ) { }

  async ngOnInit() {
    await this.storage.create(); // Initialize storage

    this.route.queryParams.subscribe(async params => {
      this.sessionId = params['sessionId'];
      if (this.sessionId === 'new') {
        this.createSession(); // Start a new session if sessionId is 'new'
      } else if (this.sessionId) {
        await this.storage.set('sessionId', this.sessionId); // Store sessionId in Ionic Storage
        this.loadSession();
      } else {
        this.sessionId = await this.storage.get('sessionId'); // Check for sessionId in Ionic Storage
        if (this.sessionId) {
          this.router.navigate([], { // Update the URL to include the sessionId
            relativeTo: this.route,
            queryParams: { sessionId: this.sessionId },
            queryParamsHandling: 'merge', // Merge with existing query params
          });
          this.loadSession();
        } else {
          this.createSession(); // Start a new session if sessionId is not found
        }
      }
    });

    // check for time since last activity periodically every 5 minutes
    interval(5 * 60 * 1000).subscribe(() => {
      this.calculateHoursSinceLastActivity();
    });

    // check for PWA update and refresh
    if (this.swUpdate.isEnabled) {
      // Optionally check for updates periodically
      interval(6 * 60 * 60 * 1000).subscribe(() => {
        this.swUpdate.checkForUpdate().then(() => console.log('Checked for updates'));
      });

      // Subscribe to version updates
      this.swUpdate.versionUpdates.subscribe(event => this.onVersionEvent(event));
    }
  }

  async installPwa() {
    // post install scripts
    window.addEventListener("appinstalled", async (evt) => {
      console.log("appinstalled fired", evt);
      this.pwaService.postInstall();
      let toast = await this.toastController.create({
        duration: 3000,
        message: 'Thanks for installing the app!'
      });
      toast.present();
    });
    // install instructions
    if (this.pwaService.install_type == "install_button") this.pwaService.promptEvent.prompt();
    if (this.pwaService.install_type == "ios_message") {
      const alert = await this.alertCtrl.create({
        header: "Install App",
        message: "To install this web app on your device tap the Browser Menu button and then 'Add to Home screen' button",
        buttons: ['OK'],
      });
      await alert.present();
    }

  }

  onVersionEvent(event: VersionEvent) {
    if (event.type === 'VERSION_READY') {
      this.promptUserToUpdate(event as VersionReadyEvent);
    }
    // Handle other event types if needed
  }

  async promptUserToUpdate(event: VersionReadyEvent) {
    const toast = await this.toastController.create({
      message: 'A new version of the app is available!',
      position: 'bottom',
      buttons: [
        {
          text: 'Reload',
          role: 'cancel',
          handler: () => {
            this.swUpdate.activateUpdate().then(() => {
              window.location.reload();
            });
          },
        },
      ],
    });
    await toast.present();
  }

  shareApp() {
    if (navigator.share) {
      navigator
        .share({
          title: 'Track feedings together!',
          text: 'Join me to track feedings together:',
          url: window.location.href,
        })
        .then(() => console.log('Successful share'))
        .catch((error) => console.log('Error sharing:', error));
    } else {
      // Implement fallback logic here
      console.log('Web Share API not supported in this browser.');
    }
  }

  async presentToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      position: 'top'
    });
    toast.present();
  }

  loadSession() {
    this.loadSessionData()
    this.loadActivities();
  }
  loadSessionData() {
    // Implementation of loadSessionData
    this.firestoreService.getSessionData(this.sessionId).subscribe(data => {
      console.log("SESSION LOADED");
      console.log(data);
      this.babyname = data.babyname;
      this.babybirthdate = data.babybirthdate;
      this.babyage = this.babybirthdate ? "undefined" : calculateBabyAge(new Date(this.babybirthdate));
      this.babyweight_kg = data.babyweight_kg;
      this.amount_required_per_day = 150 * this.babyweight_kg;
      this.user_prompt_override = data.user_prompt_override || '';
      this.additional_system_instructions = data.additional_system_instructions || '';
    });
  }

  async createSession() {
    // Implementation of createSession
    this.sessionId = await this.firestoreService.createSession(); // Create a new session
    await this.storage.set('sessionId', this.sessionId); // Store new sessionId in Ionic Storage
    this.router.navigate([], { // Update the URL to include the new sessionId
      relativeTo: this.route,
      queryParams: { sessionId: this.sessionId },
      queryParamsHandling: 'merge', // Merge with existing query params
    });
    this.loadActivities();
  }

  loadActivities() {
    this.loadingActivities = true;
    this.firestoreService.getSessionActivities(this.sessionId).subscribe(activities => {
      console.log(activities);
      this.activities = activities;
      this.refreshPostActivityData();
      this.createTimelineChart(7);
      this.loadingActivities = false;
    });
  }

  groupActivitiesByDate() {
    const grouped = this.activities.reduce((groups: { [key: string]: Activity[] }, activity) => {
      const date = new Date(activity.createdate_localisodatetimestring).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(activity);
      return groups;
    }, {});

    this.groupedActivities = Object.keys(grouped).map(date => ({
      date,
      activities: grouped[date]
    }));
  }

  formatGroupDate(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toDateString();
    }
  }

  /**
   * Add a new activity to the activities list.
   * If the activity is a feed, update the total feeds, number of feeds, and average amount per feed.
   */
  addActivity(activity: Activity) {

    // Check if the amount is valid
    if (activity.type === ActivityType.Feed && activity.amount! <= 0) {
      return;
    }

    const activity_copy = { ...activity };
    this.firestoreService.addActivity(this.sessionId, activity_copy).then(() => {
      //this.refreshPostActivityData();
      this.presentToast(`Activity added successfully! ${activity_copy.amount} mL @ ${activity_copy.createdate_localisodatetimestring}`);
    });

  }

  updateActivity(activity: Activity) {
    this.firestoreService.updateActivity(this.sessionId, activity).then(() => {
      //this.refreshPostActivityData();
      this.presentToast('Activity updated successfully!');
    });
  }

  /**
   * Delete an activity from the activities list.
   * If the activity is a feed, update the total feeds, number of feeds, and average amount per feed.
   * @param activity The activity to be deleted
   */
  async deleteActivity(activity: Activity) {
    const alert = await this.alertCtrl.create({
      header: 'Confirm Delete',
      message: 'Are you sure you want to delete this activity?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            // User clicked cancel, do nothing
          }
        },
        {
          text: 'Delete',
          handler: () => {
            // User clicked delete, proceed with deletion
            this.firestoreService.deleteActivity(this.sessionId, activity.id).then(() => {
              this.activities = this.activities.filter(a => a.id !== activity.id);
              setTimeout(() => { this.presentToast('Activity deleted!'); }, 1000); // 1-second delay to prevent jankiness
              //this.refreshPostActivityData();
            });
          }
        }
      ]
    });

    await alert.present();
  }

  refreshPostActivityData() {
    if (this.activities.length == 0) return;

    // calculate hours since last activity
    this.calculateHoursSinceLastActivity();

    // group activities by date
    this.groupActivitiesByDate(); // for the timeline
    // sort activities
    this.activities.sort((a, b) => new Date(b.createdate_localisodatetimestring).getTime() - new Date(a.createdate_localisodatetimestring).getTime());
    // recalculating total feeds
    this.calculateTotalFeeds();
    // getting new insights
    this.fetchInsights();
  }

  calculateHoursSinceLastActivity() {
    // time since last activity
    const now = new Date();
    const last_activity = this.activities[0];
    const last_activity_date = new Date(last_activity.createdate_localisodatetimestring);
    const time_since_last_activity = Math.abs(now.getTime() - last_activity_date.getTime());
    const hours_since_last_activity = time_since_last_activity / (1000 * 60 * 60);
    this.hours_since_last_activity_string = formatHours(hours_since_last_activity);
  }

  /**
   * Calculate the total amount of feeds, number of feeds, and average amount per feed in the last 24 hours.
   */
  calculateTotalFeeds() {
    const now = new Date();
    const feeds_24hrs = this.activities
      .filter(a => a.type === 'feed') // Filter only feed activities
      .filter(a => {
        const activityTime = new Date(a.createdate_localisodatetimestring);
        const diffTime = Math.abs(now.getTime() - activityTime.getTime());
        const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
        return diffHours <= 24; // Only consider feeds in the last 24 hours
      });

    // only consider feeds today
    const feeds_today = this.activities
      .filter(a => a.type === 'feed') // Filter only feed activities
      .filter(a => {
        const activityTime = new Date(a.createdate_localisodatetimestring);
        return activityTime.toDateString() === now.toDateString(); // Only consider feeds today
      });
    console.log(feeds_today);

    // Calculate total amount of feeds
    this.totalFeeds_24hrs = feeds_24hrs.reduce((sum, a) => sum + parseFloat(a.amount + ""), 0);
    this.numberOfFeeds_24hrs = feeds_24hrs.length;  // Calculate number of feeds
    this.avgAmountPerFeed_24hrs = this.numberOfFeeds_24hrs > 0 ? this.totalFeeds_24hrs / this.numberOfFeeds_24hrs : 0; // Calculate average amount per feed

    // Calculate total amount of feeds today
    this.totalFeeds_today = feeds_today.reduce((sum, a) => sum + parseFloat(a.amount + ""), 0);
    this.numberOfFeeds_today = feeds_today.length;  // Calculate number of feeds
    this.avgAmountPerFeed_today = this.numberOfFeeds_today > 0 ? this.totalFeeds_today / this.numberOfFeeds_today : 0; // Calculate average amount per feed
  }

  onModalProviderChange(event: any) {
    console.log('Selected provider:', event.detail.value);
    // Handle the change event here
    this.fetchInsights();
  }

  // function to get insights from OpenAI
  async fetchInsights() {
    this.insights = '';
    this.loadingInsights = true;

    const results = await this.llmService.getLLMInsights({
      sessionId: this.sessionId,
      useModelFrom: this.useModelFrom,
      babyweight_kg: this.babyweight_kg,
      babyname: this.babyname,
      babyage: this.babyage,
      amount_required_per_day: this.amount_required_per_day,
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userTime: getCurrentLocalISODateTime(),
      numberOfFeeds_24hrs: this.numberOfFeeds_24hrs,
      totalFeeds_24hrs: this.totalFeeds_24hrs,
      avgAmountPerFeed_24hrs: this.avgAmountPerFeed_24hrs,
      activities: this.activities,
    });

    this.insights = results.data.insights;
    this.LLM_system_instructions = results.data.LLM_system_instructions;
    this.LLM_prompt = results.data.LLM_prompt;
    this.loadingInsights = false;
  }
  onModelChange(event: any) {
    // getting new insights
    this.fetchInsights();
  }

  createTimelineChart(days: number) {
    const ctx = document.getElementById('timelineChart') as HTMLCanvasElement;
    const data = this.getLastDaysData(days);

    if (this.chart) {
      this.chart.destroy(); // Destroy the previous chart instance
    }

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Feed Amount in ML',
          data: data.feedAmounts,
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        },
        {
          label: 'Feeds per Day',
          data: data.feedCounts,
          type: 'line',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 2,
          fill: false,
          pointRadius: 0,
          yAxisID: 'y1'
        },
        {
          label: 'Target Amount',
          data: new Array(data.labels.length).fill(this.amount_required_per_day),
          type: 'line',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 2,
          fill: false,
          pointRadius: 0
        }]
      },
      options: {
        scales: {
          x: {
            beginAtZero: true
          },
          y: {
            beginAtZero: true
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            grid: {
              drawOnChartArea: false // only want the grid lines for one axis to show up
            }
          }
        }
      }
    });
  }

  getLastDaysData(days: number) {
    const labels = [];
    const feedAmounts = [];
    const feedCounts = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      labels.push(date.toISOString().split('T')[0]); // Format as YYYY-MM-DD
      feedAmounts.push(this.getFeedAmountForDate(date));
      feedCounts.push(this.getFeedCountForDate(date));
    }

    return { labels, feedAmounts, feedCounts };
  }

  getFeedAmountForDate(date: Date): number {
    const dateString = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    const totalFeedAmount = this.activities
      .filter(activity => activity.type === ActivityType.Feed)
      .filter(activity => activity.createdate_localisodatetimestring.startsWith(dateString))
      .reduce((sum, activity) => sum + activity.amount, 0);

    return totalFeedAmount;
  }

  getFeedCountForDate(date: Date): number {
    const dateString = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    const feedCount = this.activities
      .filter(activity => activity.type === ActivityType.Feed)
      .filter(activity => activity.createdate_localisodatetimestring.startsWith(dateString))
      .length;

    return feedCount;
  }

  updateChartData(days: number) {
    this.createTimelineChart(days);
  }

  async openSessionModal(event: Event) {
    event.preventDefault();

    const modal = await this.modalController.create({
      component: SessionModalComponent,
      componentProps: { sessionId: this.sessionId },
      initialBreakpoint: 0.75,
      breakpoints: [0, .50, 0.75]
    });

    modal.onDidDismiss().then((data) => {
      if (data.data) {
        const { newSessionId, action } = data.data;
        if (action === 'LOAD' && newSessionId !== this.sessionId) {
          this.sessionId = newSessionId;
          window.location.href = `/home?sessionId=${newSessionId}`;
        } else if (action === 'NEW') {
          this.sessionId = newSessionId;
          window.location.href = `/home?sessionId=new`;
        }
      }
    });

    return await modal.present();
  }

  async openBabyModal(event: Event) {
    event.preventDefault();

    const modal = await this.modalController.create({
      component: BabyModalComponent,
      componentProps: {
        babyName: this.babyname,
        babyBirthdate: this.babybirthdate,
        babyWeight: this.babyweight_kg,
        user_prompt_override: this.user_prompt_override,
        additional_system_instructions: this.additional_system_instructions,
      },
      initialBreakpoint: 1,
      breakpoints: [0, .50, 0.75, 1]
    });

    modal.onDidDismiss().then((data) => {
      if (data.data && data.data.action === 'update') {
        const sessiondata: ISession = {
          babyname: data.data.babyName,
          babybirthdate: data.data.babyBirthdate,
          babyweight_kg: data.data.babyWeight,
          user_prompt_override: data.data.user_prompt_override,
          additional_system_instructions: data.data.additional_system_instructions,
        };
        this.firestoreService.updateSessionData(this.sessionId, sessiondata).then(() => {
          this.presentToast('Baby information updated successfully!');
          this.loadSessionData();
        });
      }
    });

    return await modal.present();
  }

  async openActiviyModal(event: Event, activity?: Activity) {
    event.preventDefault();

    const modal_activity = activity ? { ...activity } : this.newEmptyActivity();
    const modal_action = activity ? 'update' : 'create';

    const modal = await this.modalController.create({
      component: ActivityFormModalComponent,
      componentProps: {
        activity: modal_activity,
        action: modal_action,
      },
      initialBreakpoint: 0.75,
      breakpoints: [0, .50, 0.75, 1]
    });

    modal.onDidDismiss().then((data) => {
      // creating an activity
      if (data.data && data.data.action === 'create') {
        this.addActivity(data.data.activity);
      }
      if (data.data && data.data.action === 'update') {
        this.updateActivity(data.data.activity);
      }
    });

    return await modal.present();
  }
  // function to open the ChatModal
  async openChatModal(event: Event) {
    event.preventDefault();
    const modal = await this.modalController.create({
      component: ChatComponent,
      componentProps: { sessionId: this.sessionId, useModelFrom: this.useModelFrom },
      initialBreakpoint: 1,
      breakpoints: [0, .50, 0.75, 1]
    });

    return await modal.present();
  }

  copyToClipboard() {
    const contentToCopy = `${this.LLM_system_instructions}\n\n${this.LLM_prompt}`;
    this.clipboard.copy(contentToCopy);
    this.presentToast('LLM Prompt copied to clipboard!');
  }

}


/// MODAL
@Component({
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Session ID</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close('')">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
  <ion-card>
    <ion-card-header>
      <ion-card-title>Switch Session</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <p>To switch to a different session, enter the session ID below and click "Reload":</p>
      <ion-item>
        <ion-label position="stacked">Session ID</ion-label>
        <ion-grid>
          <ion-row>
            <ion-col size="8">
              <ion-input [(ngModel)]="newSessionId"></ion-input>
            </ion-col>
            <ion-col size="4">
              <ion-button expand="full" (click)="close('LOAD')">Reload</ion-button>
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-item>
    </ion-card-content>
  </ion-card>

  <ion-card>
    <ion-card-header>
      <ion-card-title>New Session</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <p>To create a BRAND NEW session, click the button below (if you haven't saved the sessionID somewhere, you will lose access to the current session):</p>
      <ion-button expand="full" (click)="close('NEW')">New Session</ion-button>
    </ion-card-content>
  </ion-card>
</ion-content>
  `
})
export class SessionModalComponent {
  @Input() sessionId!: string;
  newSessionId!: string;

  constructor(private modalController: ModalController) {
  }

  ngOnInit() {
    this.newSessionId = this.sessionId;
  }

  close(action: string) {
    this.modalController.dismiss({
      newSessionId: this.newSessionId,
      action: action
    });
  }
}


/// MODAL
@Component({
  template: `
    <ion-header>
    <ion-toolbar>
      <ion-title>Baby Information</ion-title>
      <ion-buttons slot="end">
        <ion-button fill="solid" (click)="save()">Save</ion-button>
        <ion-button (click)="close()">Close</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-content>
          <ion-item>
            <ion-label position="stacked">Name</ion-label>
            <ion-input [(ngModel)]="babyName"></ion-input>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Weight in kgs (~ {{babyWeightLbs | number:'1.2-2'}} lbs) </ion-label>
            <ion-input [(ngModel)]="babyWeight" type="number" (ionChange)="convertWeightToLbs()"></ion-input>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Birthdate</ion-label>
            <ion-datetime displayFormat="MM/DD/YYYY" [(ngModel)]="babyBirthdate" presentation="date"></ion-datetime>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">User Prompt Override</ion-label>
            <ion-textarea [(ngModel)]="user_prompt_override"></ion-textarea>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Additional System Instructions</ion-label>
            <ion-textarea [(ngModel)]="additional_system_instructions"></ion-textarea>
          </ion-item>
          <ion-button expand="full" (click)="save()">Save</ion-button>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `
})
export class BabyModalComponent {
  @Input() babyName!: string;
  @Input() babyBirthdate!: LocalISODatetimeString;
  @Input() babyWeight!: number;
  @Input() user_prompt_override!: string;
  @Input() additional_system_instructions!: string;
  babyWeightLbs!: number;

  constructor(private modalController: ModalController) {
  }
  ngOnInit() {
    //console.log(this.babyBirthdate);
    this.convertWeightToLbs();
  }

  convertWeightToLbs() {
    this.babyWeightLbs = this.babyWeight * 2.20462;
  }

  close() {
    this.modalController.dismiss();
  }

  save() {
    this.modalController.dismiss({
      babyName: this.babyName,
      babyBirthdate: this.babyBirthdate,
      babyWeight: this.babyWeight,
      user_prompt_override: this.user_prompt_override,
      additional_system_instructions: this.additional_system_instructions,
      action: "update",
    });
  }

}

/// MODAL
@Component({
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{modal_title}}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
       <!-- Input for New Activity -->
  <ion-card id="new_activity">
    <ion-card-content>
      <!-- audio-recorder.component.html -->
      <ion-button shape="round" expand="full" fill="outline" (click)="startRecording()" *ngIf="!isRecording && action == 'create'">
        <ion-icon name="mic-outline"></ion-icon>
        Use your voice Voice
      </ion-button>

      <ion-button color="danger" shape="round" expand="full" (click)="stopRecording()" *ngIf="isRecording">
        <ion-icon name="stop-circle-outline"></ion-icon>
        Stop Recording
      </ion-button>

      <div *ngIf="isRecording">
        Recording...
      </div>

      <div *ngIf="isTranscribing">
        Transcribing...
      </div>

      <div *ngIf="ai_transcription">
        <strong>Transcription:</strong> {{ ai_transcription }}
      </div>

      <div *ngIf="isThinking">
        <strong>...thinking..</strong> {{ isThinking }}
      </div>

      <div *ngIf="ai_evaluated_args && ai_evaluated_args.amount != 0">
        <strong>Assistant Response:</strong> {{ ai_evaluated_args | json }}
        <ion-icon *ngIf="ai_evaluated_args.amount > 0" name="checkmark-circle-outline" color="success"></ion-icon>
        <ion-icon *ngIf="ai_evaluated_args.amount == -1" name="close-circle-outline" color="danger"></ion-icon>
        <a *ngIf="ai_evaluated_args.amount > 0" (click)="addActivityFromLLM($event)" href="#">Accept</a>
      </div>
      <ion-list>
        <ion-item>
          <ion-select label="Activity Type" [(ngModel)]="activity.type">
            <ion-select-option value="feed">Feed</ion-select-option>
            <ion-select-option value="pee">Pee</ion-select-option>
            <ion-select-option value="poop">Poop</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- Amount for Feed Activity -->
        <ion-item *ngIf="activity.type === 'feed'">
          <ion-input label="Amount (mL)" [(ngModel)]="activity.amount" type="number"
            (keydown.enter)="addActivity()"></ion-input>

        </ion-item>
        <ion-item>
          <ion-range aria-label="Custom range" [min]="0" [max]="300" [value]="0" [step]="10" [pin]="true" [ticks]="true"
            [snaps]="true" [(ngModel)]="activity.amount"></ion-range>
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Note</ion-label>
          <ion-textarea [(ngModel)]="activity.note"></ion-textarea>
        </ion-item>

        <!-- Date and Time Input -->
        <ion-item>
          <ion-label>Date & Time</ion-label>
          <ion-datetime-button label="Stacked label" labelPlacement="stacked" datetime="datetime"></ion-datetime-button>

          <ion-modal [keepContentsMounted]="true">
            <ng-template>
              <ion-datetime id="datetime" minuteValues="0,10,20,30,40,50"
                [(ngModel)]="activity.createdate_localisodatetimestring"></ion-datetime>
            </ng-template>
          </ion-modal>

        </ion-item>

        <ion-button [disabled]="activity.type === 'feed' && activity.amount === 0" expand="block"
          (click)="addActivity()">{{modal_button}}</ion-button>
      </ion-list>
    </ion-card-content>
  </ion-card>
    </ion-content>
  `
})
export class ActivityFormModalComponent {
  @Input() activity!: Activity;
  @Input() action!: "update" | "create";
  modal_title: string = "";
  modal_button: string = "";

  // recording
  isRecording!: boolean;
  isTranscribing!: boolean;
  isThinking!: boolean;
  ai_transcription!: string;
  ai_evaluated_args!: { amount: number, time: string };
  private mediaRecorder!: MediaRecorder;
  private audioChunks!: BlobPart[];


  constructor(
    private modalController: ModalController,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private llmService: LLMService,
  ) {
  }
  ngOnInit() {
    this.modal_title = this.action === 'update' ? 'Update Activity' : 'Add New Activity';
    this.modal_button = this.action === 'update' ? 'Update' : 'Add';
    this.resetRecordingVariables();
  }

  close() {
    this.modalController.dismiss();
  }

  save() {
    this.modalController.dismiss({
      action: this.action,
      activity: this.activity,
    });
  }

  addActivity(new_activity?: Activity) {
    if (!!new_activity) this.activity = new_activity;
    this.save();
  }

  // recording
  startRecording() {
    this.resetRecordingVariables();
    this.isRecording = true;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        this.mediaRecorder = new MediaRecorder(stream);
        this.mediaRecorder.start();

        this.mediaRecorder.addEventListener('dataavailable', (event) => {
          this.audioChunks.push(event.data);
        });

        this.mediaRecorder.addEventListener('stop', () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
          this.audioChunks = [];
          this.transcribeAudio(audioBlob);
        });
      })
      .catch((err) => {
        console.error('Error accessing microphone:', err);
        this.isRecording = false;
      });
  }

  stopRecording() {
    this.isRecording = false;
    this.mediaRecorder.stop();
  }

  async transcribeAudio(audioBlob: Blob) {
    this.isTranscribing = true;

    try {
      const result = await this.llmService.transcribeAudio(audioBlob);
      this.ai_transcription = result.data.transcription;
      await this.evaluateTranscription(this.ai_transcription);

    } catch (error) {
      console.error('Transcription error:', error);

    } finally {
      this.isTranscribing = false;
    }

  }

  async evaluateTranscription(transcription: string) {
    this.isThinking = true;
    // Evaluation logic will be implemented here

    const results = await this.llmService.evaluateTranscription({
      transcription: transcription,
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userTime: getCurrentLocalISODateTime(),
    });

    this.isThinking = false;
    this.ai_evaluated_args = results.data.ai_evaluated_args;

  }

  addActivityFromLLM(event: Event) {
    event.preventDefault();

    if (this.ai_evaluated_args.amount <= 0 || this.ai_evaluated_args.time === '') {
      return;
    }

    const activity: Activity = <Activity>{
      type: ActivityType.Feed,
      amount: this.ai_evaluated_args.amount,
      createdate_localisodatetimestring: this.ai_evaluated_args.time,
      note: '',
    };

    this.addActivity(activity);

    this.resetRecordingVariables();

  }

  resetRecordingVariables() {
    this.isRecording = false;
    this.isTranscribing = false;
    this.ai_transcription = '';
    this.ai_evaluated_args = { amount: 0, time: '' };
    this.audioChunks = [];
    this.isThinking = false;
  }

}