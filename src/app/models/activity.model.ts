// src/app/models/activity.model.ts

import firebase from 'firebase/compat/app'; // Import for Firestore Timestamp if needed
import { LocalISODatetimeString } from 'src/app/utils/iso-date-time';
import { Timestamp, FieldValue } from '@angular/fire/firestore';



export enum ActivityType {
  Feed = 'feed',
  Pee = 'pee',
  Poop = 'poop',
  Sleep = 'sleep',
  // Add other activity types as needed
}

export interface Activity {
    id: string;
    type: ActivityType; // Type of activity
    amount: number; // Amount of feed (if applicable)
    createdate_localisodatetimestring: LocalISODatetimeString; // Timestamp of the activity
    note?: string; // Note about the activity
    hours_since_last_feed?: string; // Hours since last feed
    [key: string]: any; // Index signature to allow additional properties
  }

export interface ActivityFs {
  id?: string;
  type: string; // Type of activity
  amount: number; // Amount of feed (if applicable)
  createdate_fstimestamp: Timestamp; // Timestamp of the activity
  note?: string; // Note about the activity
  createdAt?: Timestamp; // Timestamp of the activity
  [key: string]: any; // Index signature to allow additional properties
}
