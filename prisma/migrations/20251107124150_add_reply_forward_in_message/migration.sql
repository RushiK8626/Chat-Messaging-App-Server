-- AlterTable
ALTER TABLE `message` ADD COLUMN `is_forward` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_reply` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `referenced_message_id` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_referenced_message_id_fkey` FOREIGN KEY (`referenced_message_id`) REFERENCES `Message`(`message_id`) ON DELETE SET NULL ON UPDATE CASCADE;
