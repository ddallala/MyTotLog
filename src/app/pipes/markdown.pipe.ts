import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

@Pipe({
  name: 'markdown'
})
export class MarkdownPipe implements PipeTransform {
  async transform(value: string): Promise<string> {
    return await marked(value);
  }
}