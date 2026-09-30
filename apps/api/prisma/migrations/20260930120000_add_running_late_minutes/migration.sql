ALTER TABLE "Notification" ADD COLUMN "runningLateMinutes" INTEGER;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_runningLateMinutes_check"
  CHECK ("runningLateMinutes" IS NULL OR "runningLateMinutes" BETWEEN 1 AND 1440);
