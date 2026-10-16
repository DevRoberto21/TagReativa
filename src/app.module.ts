import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PetsModule } from './pets/pets.module';
import { ScanModule } from './scan/scan.module';
import { HealthController } from './health.controller';
import { IpThrottlerGuard } from './ip-throttler.guard';
import { TokenCleanupService } from './token-cleanup.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    UsersModule,
    AuthModule,
    PetsModule,
    ScanModule,
  ],
  controllers: [HealthController],
  providers: [
    TokenCleanupService,
    {
      provide: APP_GUARD,
      useClass: IpThrottlerGuard,
    },
  ],
})
export class AppModule {}
