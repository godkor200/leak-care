import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { HomeModule } from './home/home.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportModule } from './report/report.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ReportModule,
    HomeModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
