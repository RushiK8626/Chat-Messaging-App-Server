-- AlterTable
ALTER TABLE `notification` ADD COLUMN `action_url` VARCHAR(191) NULL,
    ADD COLUMN `notification_type` VARCHAR(191) NULL,
    ADD COLUMN `read_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `PushSubscription` (
    `subscription_id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `endpoint` LONGTEXT NOT NULL,
    `auth_key` TEXT NOT NULL,
    `p256dh_key` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PushSubscription_user_id_key`(`user_id`),
    INDEX `PushSubscription_user_id_idx`(`user_id`),
    PRIMARY KEY (`subscription_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PushSubscription` ADD CONSTRAINT `PushSubscription_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;
