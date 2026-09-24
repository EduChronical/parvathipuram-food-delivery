import {PrismaClient} from "@prisma/client";
declare global { var __ppmPrisma: PrismaClient|undefined; }
export const db=globalThis.__ppmPrisma??new PrismaClient({
  log:process.env.NODE_ENV==="development"?["warn","error"]:["error"]
});
if(process.env.NODE_ENV!=="production") globalThis.__ppmPrisma=db;
export * from "@prisma/client";
