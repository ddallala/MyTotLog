// File: src/app/utils/iso-date-time.ts

import { ISODateString } from "@capacitor/core";

export type LocalISODatetimeString = string;

export function isISODateTime(value: string): value is LocalISODatetimeString {
  const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
  if (!regex.test(value)) return false;

  const date = new Date(value);
  return !isNaN(date.getTime());
}

export function getCurrentLocalISODateTime(): LocalISODatetimeString {
  const now = new Date();
  return toLocalISODatetimeString(now);
}

export function toLocalISODatetimeString(date: Date): LocalISODatetimeString {
  const pad = (n: number) => String(n).padStart(2, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1); // Months are zero-based
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export function toSpecificISODatetimeString(date: Date, timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const options = {
    timeZone,
    year: 'numeric' as const,
    month: '2-digit' as const,
    day: '2-digit' as const,
    hour: '2-digit' as const,
    minute: '2-digit' as const,
    second: '2-digit' as const,
    fractionalSecondDigits: 3 as const,
    hourCycle: 'h23' as const,
  };

  const formatter = new Intl.DateTimeFormat('en-GB', options);
  const parts = formatter.formatToParts(date);

  const pad = (n: string) => n.padStart(2, '0');
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hours = getPart('hour');
  const minutes = getPart('minute');
  const seconds = getPart('second');
  const milliseconds = getPart('fractionalSecond');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export function IsoToLocalDate(isoDateString: LocalISODatetimeString): Date {
  const [year, month, day] = isoDateString.split('-').map(Number);
  return new Date(year, month - 1, day); // Months are zero-based
}

export function calculateBabyAge(birthdate: Date): string {
  const currentDate = new Date();
  const diffInMs = currentDate.getTime() - birthdate.getTime();
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

  const weeks = Math.floor(diffInDays / 7);
  const months = Math.floor(diffInDays / 30.44); // Average days in a month

  if (weeks <= 12) {
    return `${weeks} weeks`;
  } else if (months <= 36) {
    return `${months} months`;
  } else {
    const years = Math.floor(months / 12);
    return `${years} years`;
  }
}

export function formatHours(decimalHours: number): string {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return minutes?`${hours} hrs & ${minutes} min`: `${hours} hrs`;
}