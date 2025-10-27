const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfillPrivateChatKeys() {
  try {
    console.log('Starting backfill of private_chat_key for existing private chats...');

    // Get all private chats with their members
    const privateChats = await prisma.chat.findMany({
      where: { chat_type: 'private' },
      include: {
        members: {
          select: {
            user_id: true
          }
        }
      }
    });

    console.log(`Found ${privateChats.length} private chats to update.`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const chat of privateChats) {
      // Skip if already has a private_chat_key
      if (chat.private_chat_key) {
        skippedCount++;
        continue;
      }

      // Ensure exactly 2 members
      if (chat.members.length !== 2) {
        console.warn(`Chat ${chat.chat_id} has ${chat.members.length} members, skipping...`);
        skippedCount++;
        continue;
      }

      // Create private_chat_key from sorted user IDs
      const userIds = chat.members.map(m => m.user_id).sort((a, b) => a - b);
      const privateChatKey = userIds.join('_');

      // Update the chat
      await prisma.chat.update({
        where: { chat_id: chat.chat_id },
        data: { private_chat_key: privateChatKey }
      });

      updatedCount++;
      console.log(`Updated chat ${chat.chat_id} with key: ${privateChatKey}`);
    }

    console.log('\nBackfill complete!');
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Total: ${privateChats.length}`);

  } catch (error) {
    console.error('Error during backfill:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

backfillPrivateChatKeys();
