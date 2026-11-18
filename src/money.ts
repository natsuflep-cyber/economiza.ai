export const brl=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export function parseMoney(raw:string):number|null{
  const clean=raw.trim().replace(/\s/g,'').replace(/^R\$/,'');
  const brThousands=/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/;
  const plain=/^\d+(?:[,.]\d{1,2})?$/;
  if(!brThousands.test(clean)&&!plain.test(clean))return null;
  const normalized=brThousands.test(clean)?clean.replace(/\./g,'').replace(',','.'):clean.replace(',','.');
  const [whole,fraction='']=normalized.split('.');
  const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  return Number.isSafeInteger(cents)&&cents<=999999999999?cents:null;
}
export const moneyInput=(c:number)=> (c/100).toFixed(2).replace('.',',');
export const profit=(budget:number,spent:number)=>Math.max(0,budget-spent);
export const overage=(budget:number,spent:number)=>Math.max(0,spent-budget);
export type Meal={id:string;meal_type:'almoco'|'janta';meal_date:string;meal_time:string;budget_cents:number;spent_cents:number;created_at:string};
export const monthTotals=(items:Meal[])=>items.reduce((a,x)=>({spent:a.spent+x.spent_cents,profit:a.profit+profit(x.budget_cents,x.spent_cents)}),{spent:0,profit:0});
export function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function localTime(){const d=new Date();return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
