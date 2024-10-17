import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class PwaService {

  public promptEvent: any;
  public mobileType: 'ios' | 'android' = 'android';
  public installable: boolean = false;
  public install_type: "ios_message" | "install_button" = "install_button";

  constructor(
    public platform: Platform,
  ) {
    console.log("PLATFORM");
    console.log(this.platform.platforms())
  }

  public initPwaPrompt() {
    console.log("INIT PWA PROMPT");
    console.log(this.platform.platforms())
    console.log(this.install_type);
    console.log(this.installable);

    if (this.platform.is("android") || this.platform.is("desktop")) {
      this.mobileType = "android";
      window.addEventListener('beforeinstallprompt', (event: any) => {
        event.preventDefault();
        console.log("BEFORE INSTALL PROMPT");
        this.installable = true;
        this.promptEvent = event;
        this.install_type = "install_button";
      });
    }
    if (this.platform.is("ios")) {
      const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator['standalone']);
      if (!isInStandaloneMode) {
        this.mobileType = "ios";
        this.installable = true;
        this.install_type = "ios_message";
        //this.openPromptComponent('ios');
      }
    }
  }

  public postInstall() {
    this.installable = false;
  }
}