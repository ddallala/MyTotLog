import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';
import { ChatMessages } from 'src/app/models/messages.model';
import { ChatService } from 'src/app/services/chat.service';


@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatComponent implements OnInit {
  @ViewChild(IonContent, { static: false }) content!: IonContent;
  @Input() sessionId!: string;
  @Input() useModelFrom: string = 'openai';

  messages: ChatMessages[] = [];
  messages_on_screen: ChatMessages[] = [];
  newMessage = '';
  chatId!: string;
  messageInputDisabled = true;

  constructor(
    private modalController: ModalController,
    private chatService: ChatService,
  ) { }

  async ngOnInit() {
    // create a new session and save the chatId
    this.chatId = await this.chatService.createChatSession(this.sessionId);
    this.messageInputDisabled = false;

    // get chat messages
    let isFirstLoad = true;
    this.chatService.getChatMessages(this.sessionId, this.chatId).subscribe(messages => {
      this.messages = messages;

      const messagesWithoutSystemMessages = this.messages.filter(message => message.role !== 'system');

      if (isFirstLoad) {
        // On first load, copy all messages to messages_on_screen
        this.messages_on_screen = [...messagesWithoutSystemMessages];
        isFirstLoad = false;
      } else {
        // On subsequent updates, add only the new messages to messages_on_screen
        const newMessages = messagesWithoutSystemMessages.slice(this.messages_on_screen.length);
        this.messages_on_screen.push(...newMessages);
      }
      console.log('Messages on screen:', this.messages_on_screen);
      this.scrollToBottom();
    });

  }

  close() {
    this.modalController.dismiss();
  }

  async sendMessage() {
    if (this.newMessage.trim() !== '') {
      const msg_to_send = this.newMessage;
      this.newMessage = '';
      await this.chatService.sendMessage(
        this.sessionId,
        this.chatId,
        msg_to_send,
        this.useModelFrom,
      );
    }
  }

  scrollToBottom() {
    setTimeout(() => {
      this.content.scrollToBottom(300);
    }, 100);
  }

}
