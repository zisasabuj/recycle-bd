import { z } from 'zod';

export const placeBidSchema = z.object({
  auctionId: z.string().min(1),
  amount: z.number().positive().finite()
});
