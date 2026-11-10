/** Isolated PostgreSQL vertical slice. Never selects a store or sends email. */
import crypto from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type Ticket as DbTicket,
} from "@prisma/client";
import {
  canAccessTicket,
  validateCreateTicketInput,
  validateStatusTransition,
  redactSensitiveData,
  type User,
  type Ticket,
  type TicketStatus,
} from "../../../packages/shared/src/index.ts";

export class RepositoryError extends Error {
  public code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export interface TicketRepository {
  createTicket(actorId: string, input: unknown): Promise<DbTicket>;
  getTicket(actorId: string, id: string): Promise<DbTicket>;
  addComment(
    actorId: string,
    id: string,
    body: string,
    isInternal?: boolean,
  ): Promise<void>;
  transition(
    actorId: string,
    id: string,
    version: number,
    status: TicketStatus,
    notes: string,
  ): Promise<DbTicket>;
  decideApproval(
    actorId: string,
    id: string,
    decision: "APPROVED" | "REJECTED",
    notes: string,
  ): Promise<void>;
  acknowledgeCustody(
    actorId: string,
    id: string,
    version: number,
  ): Promise<void>;
}
type Tx = Prisma.TransactionClient;
function fail(code: string): never {
  throw new RepositoryError(code);
}
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export class PostgresRepository implements TicketRepository {
  private client: PrismaClient;
  constructor(client: PrismaClient) {
    this.client = client;
  }
  private async atomic<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.client.$transaction(operation, {
        isolationLevel: "Serializable",
        timeout: 15000,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (
          ["P2034", "P2002"].includes(error.code) ||
          (error.code === "P2010" &&
            ["40001", "40P01"].includes(String(error.meta?.code)))
        )
          fail("CONFLICT");
        if (["P2003", "P2025"].includes(error.code)) fail("INVALID_REFERENCE");
      }
      throw error;
    }
  }
  private async actor(tx: Tx, actorId: string): Promise<User> {
    const actor = await tx.user.findUnique({
      where: { id: actorId },
      include: { role: true, sbu: true },
    });
    if (!actor?.isActive || actor.role.name === "SYSTEM_SERVICE")
      fail("FORBIDDEN");
    return {
      ...actor,
      roleName: actor.role.name,
      sbuCode: actor.sbu.code,
    } as unknown as User;
  }
  private async ticket(tx: Tx, actor: User, ticketId: string) {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) fail("NOT_FOUND");
    if (!canAccessTicket(actor, ticket as unknown as Ticket)) fail("FORBIDDEN");
    return ticket;
  }
  private async event(
    tx: Tx,
    actor: User,
    ticket: DbTicket,
    action: string,
    metadata: Prisma.InputJsonObject = {},
    fromStatus: TicketStatus | null = null,
  ) {
    await tx.ticketEvent.create({
      data: {
        id: id("event"),
        ticketId: ticket.id,
        actorId: actor.id,
        actorName: actor.displayName,
        eventType: action,
        fromStatus,
        toStatus: ticket.status,
        metadata,
      },
    });
  }
  private async history(
    tx: Tx,
    actor: User,
    ticket: DbTicket,
    action: string,
    metadata: Prisma.InputJsonObject = {},
    fromStatus: TicketStatus | null = null,
  ) {
    await this.event(tx, actor, ticket, action, metadata, fromStatus);
    await this.audit(tx, actor, action, "Ticket", ticket.id, metadata);
  }
  private async audit(
    tx: Tx,
    actor: User,
    action: string,
    resource: string,
    resourceId: string,
    details: Prisma.InputJsonObject = {},
  ) {
    await tx.auditLog.create({
      data: {
        id: id("audit"),
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.roleName,
        sbuId: actor.sbuId,
        action,
        resource,
        resourceId,
        details,
      },
    });
  }
  private async intent(tx: Tx, ticket: DbTicket, operationId: string) {
    const recipient = await tx.user.findUniqueOrThrow({
      where: { id: ticket.requesterId },
    });
    const notificationId = `notification-${operationId}`;
    await tx.notification.create({
      data: {
        id: notificationId,
        ticketId: ticket.id,
        recipientId: recipient.id,
        recipientEmail: recipient.email,
        channel: "IN_APP_ONLY",
        subject: `Ticket ${ticket.ticketNumber}`,
        body: `Ticket status: ${ticket.status}`,
      },
    });
    await tx.notificationJob.create({
      data: { id: `job-${operationId}`, notificationId },
    });
  }
  async getTicket(actorId: string, ticketId: string) {
    return this.atomic(async (tx) =>
      this.ticket(tx, await this.actor(tx, actorId), ticketId),
    );
  }
  async createTicket(actorId: string, input: unknown) {
    const data = validateCreateTicketInput(input);
    return this.atomic(async (tx) => {
      const actor = await this.actor(tx, actorId);
      const category = await tx.serviceCategory.findFirst({
        where: {
          OR: [
            { id: data.serviceCategoryId },
            { slug: data.serviceCategoryId },
          ],
        },
      });
      if (!category) fail("INVALID_REFERENCE");
      // Atomic counter considers imported legacy suffixes and preserves INC/REQ format.
      const [allocation] = await tx.$queryRaw<
        { value: number }[]
      >`INSERT INTO "TicketCounter" (id,value) VALUES ('tickets', (SELECT GREATEST(1000,COALESCE(MAX(substring("ticketNumber" from '-([0-9]+)$')::integer),1000))+1 FROM "Ticket")) ON CONFLICT (id) DO UPDATE SET value=GREATEST("TicketCounter".value+1,(SELECT COALESCE(MAX(substring("ticketNumber" from '-([0-9]+)$')::integer),1000)+1 FROM "Ticket")) RETURNING value`;
      const ticketId = id("ticket");
      const ticket = await tx.ticket.create({
        data: {
          id: ticketId,
          ticketNumber: `${category.slug.includes("incident") ? "INC" : "REQ"}-${new Date().getUTCFullYear()}-${allocation.value}`,
          title: data.title,
          description: redactSensitiveData(data.description),
          requesterId: actor.id,
          sbuId: actor.sbuId,
          serviceCategoryId: category.id,
          severity: data.severity || category.defaultSeverity,
          customFormPayload: data.customFormPayload as Prisma.InputJsonObject,
          slaDueAt: new Date(
            Date.now() + category.slaResolutionMinutes * 60000,
          ),
        },
      });
      await this.history(tx, actor, ticket, "TICKET_CREATED");
      await this.intent(tx, ticket, `${ticket.id}-created`);
      return ticket;
    });
  }
  async addComment(
    actorId: string,
    ticketId: string,
    body: string,
    isInternal = false,
  ) {
    if (
      typeof body !== "string" ||
      body.trim().length < 2 ||
      body.trim().length > 2000 ||
      typeof isInternal !== "boolean"
    )
      fail("VALIDATION_ERROR");
    await this.atomic(async (tx) => {
      const actor = await this.actor(tx, actorId);
      const ticket = await this.ticket(tx, actor, ticketId);
      if (isInternal && !["IT_ADMIN", "CTO"].includes(actor.roleName))
        fail("FORBIDDEN");
      const commentId = id("comment");
      await tx.ticketComment.create({
        data: {
          id: commentId,
          ticketId,
          authorId: actor.id,
          authorName: actor.displayName,
          authorRole: actor.roleName,
          body: redactSensitiveData(body.trim()),
          isInternal,
          attachments: [],
        },
      });
      await this.history(
        tx,
        actor,
        ticket,
        isInternal ? "INTERNAL_NOTE_ADDED" : "COMMENT_ADDED",
        { commentId },
        ticket.status,
      );
      if (!isInternal) await this.intent(tx, ticket, commentId);
    });
  }
  async transition(
    actorId: string,
    ticketId: string,
    version: number,
    status: TicketStatus,
    notes: string,
  ) {
    if (
      !Number.isInteger(version) ||
      version < 0 ||
      typeof notes !== "string" ||
      notes.length > 2000
    )
      fail("VALIDATION_ERROR");
    if (status === "ESCALATED_TO_CTO" && notes.trim().length < 5)
      fail("VALIDATION_ERROR");
    return this.atomic(async (tx) => {
      const actor = await this.actor(tx, actorId);
      const ticket = await this.ticket(tx, actor, ticketId);
      const check = validateStatusTransition(
        ticket.status,
        status,
        actor.roleName,
        ticket.requesterId === actor.id,
      );
      if (!check.valid) fail("TRANSITION_NOT_ALLOWED");
      const result = await tx.ticket.updateMany({
        where: { id: ticketId, version },
        data: {
          status,
          version: { increment: 1 },
          ...(status === "ESCALATED_TO_CTO"
            ? {
                escalationReason: redactSensitiveData(notes.trim()),
                severity: "CRITICAL",
              }
            : {}),
          ...(status === "REOPENED"
            ? { closedAt: null, resolvedAt: null }
            : {}),
          ...(status === "CLOSED" ? { closedAt: new Date() } : {}),
          ...(status === "RESOLVED_PENDING_CONFIRMATION"
            ? { resolvedAt: new Date() }
            : {}),
        },
      });
      if (result.count !== 1) fail("CONFLICT");
      let updated = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketId },
      });
      if (
        status === "REOPENED" &&
        ticket.status === "RESOLVED_PENDING_CONFIRMATION"
      ) {
        const admin = await tx.user.findFirst({
          where: { role: { name: "IT_ADMIN" }, isActive: true },
          orderBy: { id: "asc" },
        });
        await this.history(
          tx,
          actor,
          updated,
          "STATUS_CHANGED_TO_REOPENED",
          {},
          ticket.status,
        );
        updated = await tx.ticket.update({
          where: { id: ticketId },
          data: {
            status: "ASSIGNED_TO_IT",
            assigneeId: admin?.id || null,
            escalationReason:
              redactSensitiveData(notes) ||
              "Requester declined resolution; requested human IT support.",
          },
        });
      }
      if (status === "ESCALATED_TO_CTO") {
        const reason = updated.escalationReason!;
        await this.event(
          tx,
          actor,
          updated,
          "ESCALATED_TO_CTO",
          {
            reason,
            escalatedByRole: actor.roleName,
          },
          ticket.status,
        );
        await this.audit(
          tx,
          actor,
          "TICKET_ESCALATED_TO_CTO",
          "Ticket",
          ticketId,
          {
            ticketNumber: ticket.ticketNumber,
            fromStatus: ticket.status,
            reason,
          },
        );
      } else {
        await this.history(
          tx,
          actor,
          updated,
          `STATUS_CHANGED_TO_${updated.status}`,
          { notes: redactSensitiveData(notes) },
          updated.status !== status ? "REOPENED" : ticket.status,
        );
      }
      await this.intent(tx, updated, `${ticketId}-v${updated.version}`);
      return updated;
    });
  }
  async decideApproval(
    actorId: string,
    approvalId: string,
    decision: "APPROVED" | "REJECTED",
    notes: string,
  ) {
    if (
      !["APPROVED", "REJECTED"].includes(decision) ||
      typeof notes !== "string" ||
      !notes.trim() ||
      notes.length > 2000
    )
      fail("VALIDATION_ERROR");
    await this.atomic(async (tx) => {
      const actor = await this.actor(tx, actorId);
      const approval = await tx.approval.findUnique({
        where: { id: approvalId },
      });
      if (!approval) fail("NOT_FOUND");
      if (
        !["IT_ADMIN", "CTO"].includes(actor.roleName) ||
        (approval.requiredRole === "CTO" && actor.roleName !== "CTO")
      )
        fail("FORBIDDEN");
      const ticket = await this.ticket(tx, actor, approval.ticketId);
      const result = await tx.approval.updateMany({
        where: { id: approvalId, status: "PENDING", version: approval.version },
        data: {
          status: decision,
          version: { increment: 1 },
          approverId: actor.id,
          decidedAt: new Date(),
          decisionNotes: redactSensitiveData(notes.trim()),
        },
      });
      if (result.count !== 1) fail("CONFLICT");
      const decisionNotes = redactSensitiveData(notes.trim());
      await this.event(
        tx,
        actor,
        ticket,
        `APPROVAL_${decision}`,
        {
          approvalId,
          actionType: approval.actionType,
          decision,
          decisionNotes,
        },
        ticket.status,
      );
      await this.audit(
        tx,
        actor,
        `APPROVAL_${decision}`,
        "Approval",
        approvalId,
        {
          ticketId: ticket.id,
          actionType: approval.actionType,
          decision,
          decisionNotes,
        },
      );
      await this.intent(tx, ticket, approvalId);
    });
  }
  async acknowledgeCustody(actorId: string, assetId: string, version: number) {
    if (!Number.isInteger(version) || version < 0) fail("VALIDATION_ERROR");
    await this.atomic(async (tx) => {
      const actor = await this.actor(tx, actorId);
      const asset = await tx.asset.findUnique({ where: { id: assetId } });
      if (!asset) fail("NOT_FOUND");
      if (
        !["IT_ADMIN", "CTO"].includes(actor.roleName) &&
        (asset.assignedUserId !== actor.id || asset.sbuId !== actor.sbuId)
      )
        fail("FORBIDDEN");
      if (
        asset.assignedUserId &&
        asset.status === "ASSIGNED" &&
        asset.handoverAckStatus === "ACKNOWLEDGED"
      )
        return;
      if (
        !asset.assignedUserId ||
        asset.status !== "HANDOVER_PENDING_ACK" ||
        asset.handoverAckStatus !== "PENDING_EMPLOYEE_ACK"
      )
        fail("ASSET_STATE_CONFLICT");
      const assigned = await tx.user.findUniqueOrThrow({
        where: { id: asset.assignedUserId },
      });
      if (assigned.sbuId !== asset.sbuId) fail("INVALID_REFERENCE");
      const history = [
        ...(asset.history as Prisma.InputJsonValue[]),
        {
          date: new Date().toISOString(),
          action: "EMPLOYEE_ACKNOWLEDGED_HANDOVER",
          actorEmail: actor.email,
          notes: `Digitally acknowledged custody by ${actor.displayName}`,
        },
      ];
      const result = await tx.asset.updateMany({
        where: { id: assetId, version },
        data: {
          version: { increment: 1 },
          status: "ASSIGNED",
          handoverAckStatus: "ACKNOWLEDGED",
          history,
        },
      });
      if (result.count !== 1) fail("CONFLICT");
      await this.audit(
        tx,
        actor,
        "ASSET_HANDOVER_ACKNOWLEDGED",
        "Asset",
        assetId,
      );
    });
  }
}
