import "./globals.css";
export const metadata={
  title:"PPM Bites — Food Delivery",
  description:"Original food delivery platform for Parvathipuram",
  manifest:"/manifest.webmanifest",
  icons:{icon:"/ppm-icon.svg"}
};
export const viewport={themeColor:"#e6502c"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
