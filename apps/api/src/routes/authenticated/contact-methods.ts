import { contactMethodsContract } from "@openrift/shared/contracts/contact-methods";
import type { UserContactMethodsResponse } from "@openrift/shared/types/api/contact-method";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(contactMethodsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Authenticated contact-methods contract. Every mutation returns the refreshed
 * list. The not-found cases on update/delete are typed NOT_FOUND errors
 * declared on the contract.
 */
export const contactMethodsRouter = {
  list: os.list.handler(async ({ context }): Promise<UserContactMethodsResponse> => {
    const { userContactMethods } = context.repos;
    const items = await userContactMethods.listForUser(context.userId);
    return { items };
  }),

  create: os.create.handler(async ({ input, context }): Promise<UserContactMethodsResponse> => {
    const { userContactMethods } = context.repos;
    const userId = context.userId;
    await userContactMethods.create(userId, input.type, input.value);
    return { items: await userContactMethods.listForUser(userId) };
  }),

  update: os.update.handler(
    async ({ input, context, errors }): Promise<UserContactMethodsResponse> => {
      const { userContactMethods } = context.repos;
      const userId = context.userId;
      const updated = await userContactMethods.update(input.id, userId, input.type, input.value);
      if (updated === undefined) {
        throw errors.NOT_FOUND({ message: "Contact method not found" });
      }
      return { items: await userContactMethods.listForUser(userId) };
    },
  ),

  remove: os.remove.handler(
    async ({ input, context, errors }): Promise<UserContactMethodsResponse> => {
      const { userContactMethods } = context.repos;
      const userId = context.userId;
      const deleted = await userContactMethods.delete(input.id, userId);
      if (!deleted) {
        throw errors.NOT_FOUND({ message: "Contact method not found" });
      }
      return { items: await userContactMethods.listForUser(userId) };
    },
  ),

  reorder: os.reorder.handler(async ({ input, context }): Promise<UserContactMethodsResponse> => {
    const { userContactMethods } = context.repos;
    const userId = context.userId;
    await userContactMethods.reorder(userId, input.ids);
    return { items: await userContactMethods.listForUser(userId) };
  }),
};
