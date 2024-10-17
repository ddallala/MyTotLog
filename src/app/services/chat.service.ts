import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, addDoc, query, orderBy } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { map, Observable } from 'rxjs';
import { ChatMessages } from '../models/messages.model';
import { getCurrentLocalISODateTime, toLocalISODatetimeString } from '../utils/iso-date-time';

@Injectable({
  providedIn: 'root'
})
export class ChatService {

  private firestore: Firestore = inject(Firestore);
  private functions: Functions = inject(Functions);

  // create chat in Firestore at sessions/{sessionId}/chats and return chatId
  async createChatSession(sessionId: string): Promise<string> {
    const createChatFunction = httpsCallable<{ sessionId: string, userTimezone: string, userTime: string }, { chatId: string }>(this.functions, 'createChat');

    try {
      const result = await createChatFunction({
        sessionId,
        userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userTime: getCurrentLocalISODateTime(),
      });
      return result.data.chatId;
    } catch (error) {
      console.error('Error creating chat:', error);
      throw new Error('Failed to create chat');
    }
  }

  // get chat messages from Firestore at sessions/{sessionId}/chats/{chatId}/messages
  getChatMessages(sessionId: string, chatId: string): Observable<ChatMessages[]> {
    const messagesRef = collection(this.firestore, 'sessions', sessionId, 'chats', chatId, 'messages');
    const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'));
    return collectionData(messagesQuery).pipe(
      map(messagesfs => messagesfs.map(messagefs => ({
        content: messagefs['content'],
        role: messagefs['role'],
        createdAt: toLocalISODatetimeString(messagefs['createdAt'].toDate()),
      })))
    );
  }

  async sendMessage(sessionId: string, chatId: string, message: string, useModelFrom: string): Promise<void> {
    const sendMessage = httpsCallable(this.functions, 'sendMessageToAi');
    const response = await sendMessage({
      sessionId,
      chatId,
      message,
      useModelFrom,
    });
  }

}
