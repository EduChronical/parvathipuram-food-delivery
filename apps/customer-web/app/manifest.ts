import type {MetadataRoute} from "next";

export const dynamic = "force-static";

export default function manifest():MetadataRoute.Manifest {
  return {
    name:"PPM Bites",
    short_name:"PPM Bites",
    description:"Food delivery in Parvathipuram",
    start_url:"/",
    display:"standalone",
    background_color:"#f8f5ef",
    theme_color:"#e6502c",
    icons:[]
  };
}
