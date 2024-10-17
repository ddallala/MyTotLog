import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { HomePage, SessionModalComponent, BabyModalComponent, ActivityFormModalComponent } from './home.page';

import { HomePageRoutingModule } from './home-routing.module';
import { MarkdownPipe } from '../pipes/markdown.pipe';
import { ChatComponent } from '../modals/chat/chat.component';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HomePageRoutingModule
  ],
  declarations: [HomePage, MarkdownPipe, SessionModalComponent, BabyModalComponent, ActivityFormModalComponent, ChatComponent]
})
export class HomePageModule {}
