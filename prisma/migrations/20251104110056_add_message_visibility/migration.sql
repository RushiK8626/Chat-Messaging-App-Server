-- CreateTable
CREATE TABLE `MessageVisibility` (
    `message_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `is_visible` BOOLEAN NOT NULL DEFAULT true,
    `hidden_at` DATETIME(3) NULL,

    PRIMARY KEY (`message_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MessageVisibility` ADD CONSTRAINT `MessageVisibility_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `Message`(`message_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageVisibility` ADD CONSTRAINT `MessageVisibility_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
