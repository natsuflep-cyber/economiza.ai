import {describe,it,expect} from 'vitest';
import {profit,overage,parseMoney,monthTotals,moneyInput} from '../src/money';

describe('Regras financeiras do Acumula',()=>{
 it('lucro somente positivo, sem perda do lucro antigo por excesso',()=>{
   expect(profit(2000,1600)).toBe(400);
   expect(profit(2000,2000)).toBe(0);
   expect(profit(2000,2300)).toBe(0);
   expect(overage(2000,2300)).toBe(300);
 });
 it('100% de lucro em gasto zero',()=>{
   expect(profit(2000,0)).toBe(2000);
   expect(profit(2500,0)).toBe(2500);
 });
 it('moeda sempre em centavos inteiros',()=>{
   expect(parseMoney('12,34')).toBe(1234);
   expect(parseMoney('25')).toBe(2500);
   expect(parseMoney('1.000,00')).toBe(100000);
   expect(parseMoney('1000.50')).toBe(100050);
   expect(parseMoney('1,234')).toBeNull();
   expect(parseMoney('-1')).toBeNull();
   expect(parseMoney('')).toBeNull();
   expect(moneyInput(1234)).toBe('12,34');
 });
 it('soma gastos completos e somente lucro positivo',()=>{
   const common={meal_date:'2026-11-17',meal_time:'20:00',created_at:''};
   expect(monthTotals([
     {...common,id:'1',meal_type:'janta',budget_cents:2500,spent_cents:1200},
     {...common,id:'2',meal_type:'almoco',budget_cents:2000,spent_cents:2300}
   ])).toEqual({spent:3500,profit:1300});
 });
 it('meses vazios não geram lucro nem gasto automaticamente',()=>{
   expect(monthTotals([])).toEqual({spent:0,profit:0});
 });
});
