/** Runtime validation of persisted records. Unknown metadata is preserved. */
import {z} from 'zod';
const text=z.string().min(1), date=z.string().datetime({offset:true});
const role=z.enum(['CUSTOMER','EMPLOYEE','IT_ADMIN','CTO','SYSTEM_SERVICE']);
const status=z.enum(['NEW','TRIAGED','AI_HANDLING','RESOLVED_PENDING_CONFIRMATION','CLOSED','ASSIGNED_TO_IT','IN_PROGRESS','ESCALATED_TO_CTO','REOPENED','AWAITING_USER','AWAITING_APPROVAL','FAILED_RETRY']);
const severity=z.enum(['LOW','MEDIUM','HIGH','CRITICAL']);
const object=z.record(z.string(),z.unknown());
const base={id:text,createdAt:date};
const schemas:Record<string,z.ZodType>={
 sbus:z.object({...base,code:text,name:text,description:z.string(),slaTier:z.enum(['STANDARD','PRIORITY','MISSION_CRITICAL']),updatedAt:date}).passthrough(),
 roles:z.object({...base,name:role,description:z.string(),permissions:z.array(text)}).passthrough(),
 users:z.object({...base,email:z.email(),displayName:text,oidcSubject:text,oidcIssuer:z.url().optional(),adDistinguishedName:text.optional(),sbuId:text,roleId:text,roleName:role,sbuCode:text,isActive:z.boolean(),updatedAt:date}).passthrough(),
 serviceCategories:z.object({...base,slug:text,name:text,description:z.string(),defaultSeverity:severity,aiEligible:z.boolean(),requiresApprovalRole:role.nullable(),formSchema:z.array(z.object({key:text,label:text,type:z.enum(['text','select','boolean','textarea']),required:z.boolean(),options:z.array(text).optional()})),slaResponseMinutes:z.number().int().positive(),slaResolutionMinutes:z.number().int().positive()}).passthrough(),
 tickets:z.object({...base,ticketNumber:text,title:text,description:text,status,severity,sbuId:text,requesterId:text,assigneeId:text.nullable(),serviceCategoryId:text,customFormPayload:object,aiSummary:z.string().nullable(),aiSuggestedFix:z.string().nullable(),aiConfidence:z.number().min(0).max(1).nullable(),escalationReason:z.string().nullable(),slaDueAt:date,resolvedAt:date.nullable(),closedAt:date.nullable(),updatedAt:date}).passthrough(),
 ticketEvents:z.object({...base,ticketId:text,actorId:text.nullable(),actorName:z.string().optional(),eventType:text,fromStatus:status.nullable(),toStatus:status.nullable(),metadata:object}).passthrough(),
 ticketComments:z.object({...base,ticketId:text,authorId:text,authorName:text,authorRole:role,body:text,isInternal:z.boolean(),attachments:z.array(z.object({fileName:text,mimeType:text,sizeBytes:z.number().int().nonnegative()}))}).passthrough(),
 assets:z.object({...base,assetTag:text,serialNumber:text,category:text,modelName:text,status:z.enum(['AVAILABLE','ASSIGNED','HANDOVER_PENDING_ACK','TAKEOVER_PENDING_ACK','MAINTENANCE','RETIRED']),sbuId:text,assignedUserId:text.nullable(),handoverAckStatus:z.enum(['PENDING_EMPLOYEE_ACK','ACKNOWLEDGED','RETURN_REQUESTED']),handoverNotes:z.string().nullable(),history:z.array(z.object({date,action:text,actorEmail:z.email(),notes:z.string()})),updatedAt:date}).passthrough(),
 approvals:z.object({...base,ticketId:text,actionType:text,requiredRole:z.enum(['IT_ADMIN','CTO']),status:z.enum(['PENDING','APPROVED','REJECTED']),requestedById:text,approverId:text.nullable(),justification:text,decisionNotes:z.string().nullable(),decidedAt:date.nullable()}).passthrough(),
 notifications:z.object({...base,ticketId:text.nullable(),recipientId:text,recipientEmail:z.email(),channel:z.enum(['EMAIL_AND_IN_APP','IN_APP_ONLY']),subject:text,body:text,status:z.enum(['QUEUED','PROCESSING','SENT','FAILED']),errorDetails:z.string().nullable(),readAt:date.nullable(),sentAt:date.nullable()}).passthrough(),
 aiActionLogs:z.object({...base,ticketId:text,provider:text,modelName:text,redactedPrompt:z.string(),classification:text,recommendedSeverity:severity,confidence:z.number().min(0).max(1),proposedTool:text.nullable(),policyDecision:z.enum(['ALLOWED_LOW_RISK','REQUIRES_HUMAN_APPROVAL','BLOCKED_BY_POLICY','ESCALATE_TO_IT']),dryRun:z.boolean(),toolOutput:object.nullable(),escalatedToIT:z.boolean()}).passthrough(),
 auditLogs:z.object({...base,actorId:text.nullable(),actorEmail:z.email().nullable(),actorRole:role.nullable(),sbuId:text.nullable(),action:text,resource:text,resourceId:text.nullable(),ipAddress:text,details:object}).passthrough(),
 knowledgeArticles:z.object({...base,slug:text,title:text,category:text,tags:z.array(text),content:text,isApproved:z.boolean(),updatedAt:date}).passthrough(),
 authSessions:z.object({id:z.string().regex(/^[a-f0-9]{64}$/),userId:text,expiresAt:z.number().finite(),kind:z.literal('oidc').optional(),issuer:z.url().optional(),subject:text.optional()}).passthrough().refine(s=>s.kind==='oidc'?!!(s.issuer&&s.subject):s.issuer===undefined&&s.subject===undefined),
};
export function validateRecordSchemas(state:unknown):void {
 if(!state||typeof state!=='object'||Array.isArray(state)) throw new Error('PERSISTENCE_INVALID: Expected database object');
 const data=state as Record<string,unknown>;
 for(const [name,schema] of Object.entries(schemas)) {
  if(name==='authSessions'&&data[name]===undefined) continue;
  const result=z.array(schema).safeParse(data[name]);
  if(!result.success) throw new Error(`PERSISTENCE_INVALID: Invalid ${name} field types or required fields`);
 }
}
