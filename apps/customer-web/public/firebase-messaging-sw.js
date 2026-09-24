self.addEventListener("push",event=>{
  let payload={};
  try{payload=event.data?event.data.json():{}}catch{}
  const notification=payload.notification||payload.data||{};
  const title=notification.title||"PPM Bites";
  const body=notification.body||"You have a new update.";
  const data=payload.data||{};
  const options={
    body,
    icon:"/ppm-icon.svg",
    badge:"/ppm-icon.svg",
    tag:String(data.orderId||data.type||"ppm-bites"),
    data:{url:data.url||"/notifications/"}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=event.notification.data&&event.notification.data.url?event.notification.data.url:"/notifications/";
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const client of list){
      if("focus" in client){
        if("navigate" in client) client.navigate(target);
        return client.focus();
      }
    }
    if(clients.openWindow)return clients.openWindow(target);
  }));
});
