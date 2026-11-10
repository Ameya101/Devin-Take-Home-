import { z } from "zod";
import { parseToMinorUnits } from "@/kit/ui/money";
import { REFUND_REASONS } from "./config";

/** Shape of the "Issue refund" form. Amount is entered in dollars and converted to integer cents. */
export const refundFormSchema = z.object({
  paymentId: z.string().min(1),
  amount: z
    .string()
    .transform((v, ctx) => {
      const cents = parseToMinorUnits(v);
      if (cents === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Amount must be a number with at most 2 decimals" });
        return z.NEVER;
      }
      return cents;
    })
    .pipe(z.number().int().positive("Amount must be greater than 0")),
  reason: z.enum(REFUND_REASONS),
  note: z.string().trim().max(500).optional(),
});
export type RefundFormInput = z.infer<typeof refundFormSchema>;

/** Server-side bound check against the live remaining refundable amount. */
export function refundAmountSchema(remainingCents: number) {
  return z
    .number()
    .int()
    .positive("Amount must be greater than 0")
    .max(remainingCents, `Amount exceeds the remaining refundable amount (${remainingCents} cents)`);
}
