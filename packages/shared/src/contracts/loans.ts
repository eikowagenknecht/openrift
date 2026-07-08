import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { idParamSchema, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

export const LOAN_STATUSES = ["active", "returned", "written_off"] as const;

const loanStatusSchema = z.enum(LOAN_STATUSES);

/**
 * Record a loan (lender only, active immediately — ADR-039). Exactly one of
 * `borrowerUserId` (a friend-group co-member) or `borrowerName` (someone not
 * on the app) must be set. `contextCollectionId` biases the automatic copy
 * selection toward the collection the lend action was triggered in.
 */
export const createLoanSchema = z
  .object({
    printingId: z.uuid(),
    quantity: z.number().int().min(1),
    borrowerUserId: z.string().min(1).optional(),
    borrowerName: z.string().trim().min(1).max(100).optional(),
    contextCollectionId: z.uuid().optional(),
  })
  .refine((input) => (input.borrowerUserId === undefined) !== (input.borrowerName === undefined), {
    message: "Set exactly one of borrowerUserId or borrowerName",
  });

/** Mark `quantity` more copies as physically returned (lender only). */
export const returnLoanCopiesSchema = z.object({
  quantity: z.number().int().min(1),
});

/**
 * Close a loan whose outstanding copies are never coming back (lender only).
 * `removeCopies` is the ADR-039 apply/skip proposal: true disposes the
 * outstanding copies from the lender's collection, false only releases them.
 */
export const writeOffLoanSchema = z.object({
  removeCopies: z.boolean(),
});

export const loanCounterpartySchema = z
  .object({
    userId: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
    gravatarHash: z.string(),
  })
  .openapi("LoanCounterparty");

export const loanResponseSchema = z
  .object({
    id: z.string(),
    /** The viewer's side: `lender` owns the copies, `borrower` holds them. */
    role: z.enum(["lender", "borrower"]),
    /**
     * The other party, when they are a user. For lender-role rows this is the
     * member borrower; for borrower-role rows it is always the lender. Null
     * together with `counterpartyName` means a departed member borrower.
     */
    counterparty: loanCounterpartySchema.nullable(),
    /** Free-text borrower name (lender-role rows only). */
    counterpartyName: z.string().nullable(),
    printingId: z.string(),
    cardId: z.string(),
    quantity: z.number().int().positive(),
    returnedQuantity: z.number().int().nonnegative(),
    status: loanStatusSchema,
    acknowledgedAt: z.string().nullable(),
    rejectedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    closedAt: z.string().nullable(),
    /** `acknowledge` when the viewer is an unconfirmed member borrower. */
    actionNeeded: z.enum(["acknowledge"]).nullable(),
  })
  .openapi("LoanResponse");

export const loanListResponseSchema = z
  .object({ items: z.array(loanResponseSchema) })
  .openapi("LoanListResponse");

export const loanActionCountsResponseSchema = z
  .object({ total: z.number().int().nonnegative() })
  .openapi("LoanActionCountsResponse");

/** Borrower-picker data: co-members across the viewer's groups + past free-text names. */
export const loanBorrowerOptionsResponseSchema = z
  .object({
    members: z.array(loanCounterpartySchema),
    recentNames: z.array(z.string()),
  })
  .openapi("LoanBorrowerOptionsResponse");

const TAG = "Loans";

/**
 * oRPC contract for the authenticated lending endpoints (mounted at
 * `/api/v1/loans`, ADR-039). All require a session (`authedRoute`). Domain
 * codes per route: `create` → NOT_FOUND (printing or borrower) + BAD_REQUEST
 * (self-loan, borrower not a co-member) + CONFLICT (fewer unclaimed copies
 * than requested); the lifecycle mutations → NOT_FOUND (loan, or not the
 * viewer's side of it) + CONFLICT (wrong state) and take the loan id as a
 * path param. `returnCopies` also adds BAD_REQUEST (more than outstanding).
 */
export const loansContract = {
  create: authedRoute
    .route({ method: "POST", path: "/api/v1/loans", tags: [TAG], successStatus: 201 })
    .input(createLoanSchema)
    .errors({
      NOT_FOUND: { message: "Printing or borrower not found" },
      BAD_REQUEST: { message: "Invalid loan" },
      CONFLICT: { message: "Not enough available copies" },
    })
    .output(loanResponseSchema),
  list: authedRoute
    .route({ method: "GET", path: "/api/v1/loans", tags: [TAG] })
    .output(loanListResponseSchema),
  actionCounts: authedRoute
    .route({ method: "GET", path: "/api/v1/loans/action-counts", tags: [TAG] })
    .output(loanActionCountsResponseSchema),
  borrowerOptions: authedRoute
    .route({ method: "GET", path: "/api/v1/loans/borrower-options", tags: [TAG] })
    .output(loanBorrowerOptionsResponseSchema),
  acknowledge: authedRoute
    .route({ method: "POST", path: "/api/v1/loans/{id}/acknowledge", tags: [TAG] })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Loan not found" },
      CONFLICT: { message: "Loan is not active" },
    })
    .output(loanResponseSchema),
  reject: authedRoute
    .route({ method: "POST", path: "/api/v1/loans/{id}/reject", tags: [TAG] })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Loan not found" },
      CONFLICT: { message: "Loan is not active" },
    })
    .output(loanResponseSchema),
  returnCopies: authedRoute
    .route({ method: "POST", path: "/api/v1/loans/{id}/return", tags: [TAG] })
    .input(withParams(idParamSchema, returnLoanCopiesSchema))
    .errors({
      NOT_FOUND: { message: "Loan not found" },
      BAD_REQUEST: { message: "More copies than are outstanding" },
      CONFLICT: { message: "Loan is not active" },
    })
    .output(loanResponseSchema),
  writeOff: authedRoute
    .route({ method: "POST", path: "/api/v1/loans/{id}/write-off", tags: [TAG] })
    .input(withParams(idParamSchema, writeOffLoanSchema))
    .errors({
      NOT_FOUND: { message: "Loan not found" },
      CONFLICT: { message: "Loan is not active" },
    })
    .output(loanResponseSchema),
  remove: authedRoute
    .route({ method: "DELETE", path: "/api/v1/loans/{id}", tags: [TAG] })
    .input(idParamSchema)
    .errors({
      NOT_FOUND: { message: "Loan not found" },
    })
    .output(z.object({ deleted: z.boolean() }).openapi("LoanDeleteResponse")),
};

export type LoansContract = typeof loansContract;
