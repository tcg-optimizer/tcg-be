import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getWelcome() {
    return { message: 'TCG스캐너에 오신 것을 환영합니다!' };
  }
}
