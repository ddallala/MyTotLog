import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Activity, ActivityFs } from 'src/app/models/activity.model';
import { formatHours, toLocalISODatetimeString } from '../utils/iso-date-time';
import { ISession, ISessionFs } from '../models/session.model';

import { Firestore, collection, doc, setDoc, updateDoc, deleteDoc, collectionData, docData, query, orderBy } from '@angular/fire/firestore';
import { serverTimestamp, Timestamp } from 'firebase/firestore';

@Injectable({
  providedIn: 'root'
})
export class FirestoreService {
  private firestore: Firestore = inject(Firestore);
  constructor() { }

  createSession(): Promise<string> {
    const sessionsRef = collection(this.firestore, 'sessions');
    const newSessionRef = doc(sessionsRef);
    const newSession: ISessionFs = {
      createdAt: serverTimestamp(),
      babyweight_kg: 0,
      babyname: '',
      babybirthdate: Timestamp.now(),
      user_prompt_override: '',
      additional_system_instructions: '',
    };

    return setDoc(newSessionRef, newSession).then(() => newSessionRef.id);
  }

  getSessionData(sessionId: string): Observable<ISession> {
    const sessionRef = doc(this.firestore, 'sessions', sessionId);
    return docData(sessionRef).pipe(
      map(sessionfs => {
        const sessionData = sessionfs as ISessionFs;
        return {
          babyweight_kg: sessionData.babyweight_kg,
          babyname: sessionData.babyname,
          babybirthdate: sessionData.babybirthdate ? toLocalISODatetimeString((sessionData.babybirthdate as Timestamp).toDate()) : null,
          user_prompt_override: sessionData.user_prompt_override || '',
          additional_system_instructions: sessionData.additional_system_instructions || '',
        } as ISession;
      })
    );
  }

  updateSessionData(sessionId: string, babyInfo: ISession): Promise<void> {
    const sessionRef = doc(this.firestore, 'sessions', sessionId);
    const newsessiondata: ISessionFs = {
      babyweight_kg: babyInfo.babyweight_kg,
      babyname: babyInfo.babyname,
      babybirthdate: Timestamp.fromDate(new Date(babyInfo.babybirthdate)),
      user_prompt_override: babyInfo.user_prompt_override,
      additional_system_instructions: babyInfo.additional_system_instructions,
    };
    return updateDoc(sessionRef, newsessiondata);
  }

  getSessionActivities(sessionId: string): Observable<Activity[]> {
    const activitiesRef = collection(this.firestore, 'sessions', sessionId, 'activities');
    const sortedActivitiesRef = query(activitiesRef, orderBy('createdate_fstimestamp', 'desc'));
    return collectionData(sortedActivitiesRef, { idField: 'id' }).pipe(
      map(activitiesfs => {
        const activities = activitiesfs.map(activityfs => ({
          id: activityfs['id'],
          type: activityfs['type'],
          amount: activityfs['amount'],
          createdate_localisodatetimestring: toLocalISODatetimeString((activityfs['createdate_fstimestamp'] as Timestamp).toDate()),
          note: activityfs['note'], // Add note property
        }) as Activity);

        // Calculate hours_since_last_feed
        for (let i = 0; i < activities.length; i++) {
          if (i < activities.length - 1) {
            const currentActivityDate = new Date(activities[i].createdate_localisodatetimestring);
            const previousActivityDate = new Date(activities[i + 1].createdate_localisodatetimestring);
            const diffInMs = currentActivityDate.getTime() - previousActivityDate.getTime();
            const diffInHours = diffInMs / (1000 * 60 * 60);
            activities[i]['hours_since_last_feed'] = formatHours(diffInHours);
          } else {
            activities[i]['hours_since_last_feed'] = "null"; // No previous activity
          }
        }

        return activities;
      })
    );
  }

  addActivity(sessionId: string, activity: Activity): Promise<void> {
    const activitiesRef = collection(this.firestore, 'sessions', sessionId, 'activities');
    const newActivityRef = doc(activitiesRef);
    const activity_fs: ActivityFs = {
      id: newActivityRef.id,
      type: activity.type,
      amount: activity.amount,
      note: activity.note, // Add note property
      createdate_fstimestamp: Timestamp.fromDate(new Date(activity.createdate_localisodatetimestring)),
      createdAt: <Timestamp>serverTimestamp(),
    };
    return setDoc(newActivityRef, activity_fs);
  }

  updateActivity(sessionId: string, activity: Activity): Promise<void> {
    const activityRef = doc(this.firestore, 'sessions', sessionId, 'activities', activity.id);
    const activity_fs: ActivityFs = {
      type: activity.type,
      amount: activity.amount,
      note: activity.note, // Add note property
      createdate_fstimestamp: Timestamp.fromDate(new Date(activity.createdate_localisodatetimestring)),
    };
    return updateDoc(activityRef, activity_fs);
  }

  deleteActivity(sessionId: string, activityId: string): Promise<void> {
    const activityRef = doc(this.firestore, 'sessions', sessionId, 'activities', activityId);
    return deleteDoc(activityRef);
  }

}