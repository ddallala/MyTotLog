import { Timestamp, FieldValue } from '@angular/fire/firestore';
import { LocalISODatetimeString } from '../utils/iso-date-time';

export interface ChatMessagesFs {
    role: string;
    content: string;
    createdAt?: Timestamp; // Timestamp of the activity
    [key: string]: any; // Index signature to allow additional properties
}

export interface ChatMessages {
    role: string;
    content: string;
    createdAt?: LocalISODatetimeString; // Timestamp of the activity
    [key: string]: any; // Index signature to allow additional properties
}