import React,{useMemo} from 'react';
import { EmptyState } from '../components/Common.jsx';

export function DemandHeatmap({points=[]}){
  const plot=useMemo(()=>{
    if(!points.length)return null;
    const lats=points.map(p=>Number(p.latitude)),lngs=points.map(p=>Number(p.longitude));
    let minLat=Math.min(...lats),maxLat=Math.max(...lats),minLng=Math.min(...lngs),maxLng=Math.max(...lngs);
    if(minLat===maxLat){minLat-=.01;maxLat+=.01;} if(minLng===maxLng){minLng-=.01;maxLng+=.01;}
    const maxCount=Math.max(1,...points.map(p=>Number(p.openOrderCount)||0));
    return points.map((p,i)=>({
      ...p,
      x:8+84*((Number(p.longitude)-minLng)/(maxLng-minLng)),
      y:92-84*((Number(p.latitude)-minLat)/(maxLat-minLat)),
      radius:3+9*Math.sqrt((Number(p.openOrderCount)||0)/maxCount),
      opacity:.22+.68*((Number(p.openOrderCount)||0)/maxCount),key:`${p.latitude}:${p.longitude}:${i}`
    }));
  },[points]);
  if(!plot)return <EmptyState title="ఇప్పుడే డిమాండ్ హాట్‌స్పాట్ లేదు" detail="కొత్త ఆర్డర్లు వచ్చినప్పుడు ఇక్కడ కనిపిస్తాయి."/>;
  return <div className="heatmap-wrap">
    <svg className="heatmap" viewBox="0 0 100 100" role="img" aria-label="Parvathipuram live delivery demand heatmap">
      <rect x="1" y="1" width="98" height="98" rx="8" className="heatmap-base"/>
      {plot.map(p=><g key={p.key}><circle cx={p.x} cy={p.y} r={p.radius} opacity={p.opacity} className="heat-dot"/><text x={p.x} y={p.y+.8} textAnchor="middle" className="heat-label">{p.openOrderCount}</text></g>)}
    </svg>
    <p className="muted small">వృత్తం పెద్దగా ఉంటే ఆ ప్రాంతంలో ఓపెన్ ఆర్డర్లు ఎక్కువ. ఇది live order buckets ఆధారంగా ఉంటుంది.</p>
  </div>;
}
