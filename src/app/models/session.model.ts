import firebase from 'firebase/compat/app'; // Import for Firestore Timestamp if needed
import { LocalISODatetimeString } from 'src/app/utils/iso-date-time';


export interface ISession {
    babyweight_kg: number; 
    babyname: string
    babybirthdate: LocalISODatetimeString;
    user_prompt_override?: string;
    additional_system_instructions?: string;
    [key: string]: any; // Index signature to allow additional properties
}

export interface ISessionFs {
    id?: string;
    babyweight_kg: number; 
    babyname: string
    babybirthdate: firebase.firestore.Timestamp; // Timestamp of the activity
    user_prompt_override?: string;
    additional_system_instructions?: string;
    [key: string]: any; // Index signature to allow additional properties
}