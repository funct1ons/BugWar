export function formatUnits(value:number):string {
 const n=Math.max(0,Number.isFinite(value)?value:0);
 if(n>=1e9)return `${(n/1e9).toFixed(1)}B`;
 if(n>=1e6)return `${(n/1e6).toFixed(1)}M`;
 if(n>=1e4)return `${(n/1e3).toFixed(1)}K`;
 return String(Math.floor(n));
}
