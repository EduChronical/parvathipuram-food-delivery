import type {RoleCode} from "@ppm/core";
export type AuthUser={id:string;roles:RoleCode[];email?:string;phone?:string};
declare module "fastify" {
  interface FastifyRequest { authUser?:AuthUser; requestId:string; }
}
