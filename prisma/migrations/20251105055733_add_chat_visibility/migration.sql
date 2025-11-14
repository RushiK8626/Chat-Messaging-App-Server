-- CreateTable
CREATE TABLE `ChatVisibility` (
    `chat_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `is_visible` BOOLEAN NOT NULL DEFAULT true,
    `is_archived` BOOLEAN NOT NULL DEFAULT false,
    `hidden_at` DATETIME(3) NULL,
    `archived_at` DATETIME(3) NULL,

    PRIMARY KEY (`chat_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChatVisibility` ADD CONSTRAINT `ChatVisibility_chat_id_fkey` FOREIGN KEY (`chat_id`) REFERENCES `Chat`(`chat_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatVisibility` ADD CONSTRAINT `ChatVisibility_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;
