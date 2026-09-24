import { integer, oneOf, uuid } from '../http/validation.js';
import { exportOrdersCsv, getAdminLiveDashboard, listOperationalLogs } from '../services/admin-dashboard.service.js';
import { listFraudFlags, resolveFraudFlag, scanOrderFraud } from '../services/fraud-risk.service.js';

export function registerAdminDashboardRoutes(router) {
  router.add('GET','/v1/admin-dashboard/live',{auth:'jwt'},({actor,requestId}) => getAdminLiveDashboard(actor.userId,requestId));
  router.add('GET','/v1/admin-dashboard/logs',{auth:'jwt'},({actor,query,requestId}) => listOperationalLogs(actor.userId,requestId,{
    type:query.type?oneOf(query.type,'type',['all','cancelled','rejected','unassigned']):'all',
    limit:query.limit?integer(Number(query.limit),'limit',{min:1,max:500}):150
  }));
  router.add('GET','/v1/admin-dashboard/fraud-flags',{auth:'jwt'},({actor,query,requestId}) => listFraudFlags(actor.userId,requestId,{
    unresolvedOnly:query.unresolvedOnly===undefined?true:query.unresolvedOnly!=='false',
    limit:query.limit?integer(Number(query.limit),'limit',{min:1,max:500}):100
  }));
  router.add('POST','/v1/admin-dashboard/fraud-flags/:flagId/resolve',{auth:'jwt'},({actor,params,requestId}) => resolveFraudFlag(actor.userId,requestId,integer(Number(params.flagId),'flagId',{min:1,max:Number.MAX_SAFE_INTEGER})));
  router.add('POST','/v1/admin-dashboard/fraud/scan/:orderId',{auth:'jwt'},({actor,params,requestId}) => scanOrderFraud(actor.userId,requestId,uuid(params.orderId,'orderId')));
  router.add('GET','/v1/admin-dashboard/reports/orders.csv',{auth:'jwt'},async ({actor,query,requestId,res}) => {
    const period=oneOf(query.period || 'daily','period',['daily','weekly','monthly']);
    const report=await exportOrdersCsv(actor.userId,requestId,period,query.date);
    const date=(query.date || new Date().toISOString().slice(0,10)).replace(/[^0-9-]/g,'');
    const body=report.csv;
    res.statusCode=200;
    res.setHeader('content-type','text/csv; charset=utf-8');
    res.setHeader('content-disposition',`attachment; filename="orders-${period}-${date}.csv"`);
    res.setHeader('cache-control','no-store');
    res.setHeader('x-report-row-count',String(report.rowCount));
    res.end(body);
  });
}
