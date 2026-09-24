export type GeoResult={
  latitude:number;
  longitude:number;
  formattedAddress:string;
  city?:string;
  locality?:string;
  postalCode?:string;
};

export interface MapsProvider{
  geocode(query:string):Promise<GeoResult[]>;
  reverse(latitude:number,longitude:number):Promise<GeoResult|null>;
}

class GoogleMapsProvider implements MapsProvider{
  private key=process.env.MAP_API_KEY!;
  async geocode(query:string){
    const url="https://maps.googleapis.com/maps/api/geocode/json?address="+encodeURIComponent(query)+"&key="+encodeURIComponent(this.key);
    const res=await fetch(url); if(!res.ok) throw new Error("MAP_PROVIDER_ERROR");
    const data:any=await res.json();
    return (data.results??[]).slice(0,8).map((r:any)=>this.convert(r));
  }
  async reverse(latitude:number,longitude:number){
    const url="https://maps.googleapis.com/maps/api/geocode/json?latlng="+latitude+","+longitude+"&key="+encodeURIComponent(this.key);
    const res=await fetch(url); if(!res.ok) throw new Error("MAP_PROVIDER_ERROR");
    const data:any=await res.json();
    return data.results?.[0]?this.convert(data.results[0]):null;
  }
  private convert(r:any):GeoResult{
    const components=r.address_components??[];
    const get=(type:string)=>components.find((c:any)=>c.types?.includes(type))?.long_name;
    return {
      latitude:Number(r.geometry.location.lat),
      longitude:Number(r.geometry.location.lng),
      formattedAddress:String(r.formatted_address??""),
      city:get("locality")??get("administrative_area_level_2"),
      locality:get("sublocality")??get("sublocality_level_1"),
      postalCode:get("postal_code")
    };
  }
}

class MapboxProvider implements MapsProvider{
  private key=process.env.MAP_API_KEY!;
  async geocode(query:string){
    const url="https://api.mapbox.com/geocoding/v5/mapbox.places/"+encodeURIComponent(query)+".json?country=in&limit=8&access_token="+encodeURIComponent(this.key);
    const res=await fetch(url); if(!res.ok) throw new Error("MAP_PROVIDER_ERROR");
    const data:any=await res.json();
    return (data.features??[]).map((f:any)=>this.convert(f));
  }
  async reverse(latitude:number,longitude:number){
    const url="https://api.mapbox.com/geocoding/v5/mapbox.places/"+longitude+","+latitude+".json?limit=1&access_token="+encodeURIComponent(this.key);
    const res=await fetch(url); if(!res.ok) throw new Error("MAP_PROVIDER_ERROR");
    const data:any=await res.json();
    return data.features?.[0]?this.convert(data.features[0]):null;
  }
  private convert(f:any):GeoResult{
    const context=[f,...(f.context??[])];
    const find=(prefix:string)=>context.find((x:any)=>String(x.id??"").startsWith(prefix))?.text;
    return {
      latitude:Number(f.center?.[1]),
      longitude:Number(f.center?.[0]),
      formattedAddress:String(f.place_name??f.text??""),
      city:find("place.")??find("district."),
      locality:find("locality.")??find("neighborhood."),
      postalCode:find("postcode.")
    };
  }
}

export function mapsProvider():MapsProvider|null{
  if(!process.env.MAP_API_KEY) return null;
  if(process.env.MAP_PROVIDER==="google") return new GoogleMapsProvider();
  if(process.env.MAP_PROVIDER==="mapbox") return new MapboxProvider();
  return null;
}
