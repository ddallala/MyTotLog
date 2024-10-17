import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { Functions, httpsCallable, HttpsCallableResult } from '@angular/fire/functions';

interface LLMInsightsResponse {
  insights: string;
  LLM_prompt: string;
  LLM_system_instructions: string;
  // Add other properties if there are more in the response
}

interface LLMEvaluationResponse {
  ai_evaluated_args: { amount: number, time: string };
}

interface TranscriptionRequest {
  audioBase64: string;
}

interface TranscriptionResponse {
  transcription: string;
}

@Injectable({
  providedIn: 'root'
})
export class LLMService {
  private functions: Functions = inject(Functions);
  private firestore: Firestore = inject(Firestore);
  
  constructor() { }

  callOpenAI(prompt: string) {
    const callable = httpsCallable(this.functions, 'callOpenAI');
    return callable({ prompt });
  }

  getLLMInsights(request?: any): Promise<HttpsCallableResult<LLMInsightsResponse>> {
    const callable = httpsCallable<LLMInsightsResponse>(this.functions, 'fetchInsights');
    return callable(request) as Promise<HttpsCallableResult<LLMInsightsResponse>>;
  }

  evaluateTranscription(request?: any): Promise<HttpsCallableResult<LLMEvaluationResponse>> {
    const callable = httpsCallable(this.functions, 'evaluateTranscription');
    return callable(request) as Promise<HttpsCallableResult<LLMEvaluationResponse>>;
  }

  transcribeAudio(audioBlob: Blob): Promise<HttpsCallableResult<TranscriptionResponse>> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result as string;
        const base64Data = base64Audio.split(',')[1]; // Remove the data URL prefix

        const callable = httpsCallable<TranscriptionRequest, TranscriptionResponse>(this.functions, 'transcribeAudio');
        callable({ audioBase64: base64Data })
          .then(resolve)
          .catch(reject);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });
  }
}
