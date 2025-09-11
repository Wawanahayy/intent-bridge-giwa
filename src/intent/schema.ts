import { z } from "zod";

export const Direction = z.enum(["L1_TO_L2", "L2_TO_L1"]);

// BRIDGE
export const IntentBridge = z.object({
  goal: z.literal("bridge"),
  direction: Direction,
  amountEth: z.string().regex(/^\d+(\.\d+)?$/, "invalid number"),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address").optional(),
  constraints: z.object({
    deadline_sec: z.number().int().positive().optional()
  }).default({})
});
export type IntentBridge = z.infer<typeof IntentBridge>;

// SWAP (USDC -> ETH di Sepolia)
export const IntentSwap = z.object({
  goal: z.literal("swap"),
  amountUsdc: z.string().regex(/^\d+(\.\d+)?$/, "invalid number"),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address").optional(),
  constraints: z.object({
    deadline_sec: z.number().int().positive().optional()
  }).default({})
});
export type IntentSwap = z.infer<typeof IntentSwap>;

// UNION – dipakai di UI
export const IntentAny = z.union([IntentBridge, IntentSwap]);
export type IntentAny = z.infer<typeof IntentAny>;
