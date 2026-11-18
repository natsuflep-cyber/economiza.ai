import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {ArrowDownRight,ArrowRight,CalendarDays,Check,ChevronDown,ChevronLeft,ChevronRight,Clock3,Coins,Edit3,LogOut,Menu,Moon,Plus,ShieldCheck,Sun,Trash2,TrendingUp,UtensilsCrossed,Wallet,X} from 'lucide-react';
import type {Session} from '@supabase/supabase-js';
import {supabase,configured} from './supabase';
import {brl,parseMoney,moneyInput,profit,overage,localDate,localTime,monthTotals,type Meal} from './money';

type Settings={balance_cents:number;theme:'light'|'dark'};
type FormState={id:string|null;type:'almoco'|'janta';date:string;time:string;budget:string;spent:string;noSpend:boolean};
const monthFmt=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'});
const dateFmt=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'});
const dateTitleFmt=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'});
const labelMeal=(t:string)=>t==='almoco'?'Almoço':'Janta';
const isoLocal=(s:string)=>new Date(`${s}T12:00:00`);
const currentMonth=()=>localDate().slice(0,7);
const keyDate=(s:string)=>s.split('-').reverse().join('/');
const errorMessage=(e:unknown)=>{
 const message= e instanceof Error?e.message:(e && typeof e==='object' && 'message' in e)?String((e as {message:unknown}).message):String(e);
 if(message.includes('meal_entries_user_id_meal_date_meal_type_key')||message.includes('meal_entries_user_id_meal_date_meal_type'))return 'Já existe essa refeição nessa data. Abra o registro existente para editar.';
 if(message.includes('SALDO_INSUFICIENTE'))return 'Saldo insuficiente. Confirme se deseja permitir o saldo negativo.';
 if(message.includes('JWT')||message.includes('refresh_token'))return 'Sua sessão expirou. Entre novamente.';
 return message;
};
function App(){
 const [session,setSession]=useState<Session|null>(null);
 const [authLoading,setAuthLoading]=useState(true);
 const [isBusy,setIsBusy]=useState(false);
 const [settings,setSettings]=useState<Settings|null>(null);
 const [entries,setEntries]=useState<Meal[]>([]);
 const [month,setMonth]=useState(currentMonth());
 const [form,setForm]=useState<FormState|null>(null);
 const [balanceEditor,setBalanceEditor]=useState(false);
 const [newBalance,setNewBalance]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [menuOpen,setMenuOpen]=useState(false);
 const [showAll,setShowAll]=useState(false);
 const [theme,setTheme]=useState<'light'|'dark'>(()=>localStorage.getItem('acumula-theme')==='dark'?'dark':'light');
 const [loaded,setLoaded]=useState(false);
 const [authEmail,setAuthEmail]=useState('');
 const [authPassword,setAuthPassword]=useState('');
 const [resetMode,setResetMode]=useState(false);
 const [passwordMode,setPasswordMode]=useState(false);
 const [newPassword,setNewPassword]=useState('');
 const [overdraftConfirm,setOverdraftConfirm]=useState(false);
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('acumula-theme',theme)},[theme]);
 useEffect(()=>{
   if(!supabase){setAuthLoading(false);return;}
   const client=supabase;
   client.auth.getSession().then(({data})=>{setSession(data.session);setAuthLoading(false)}).catch(()=>setAuthLoading(false));
   const {data:{subscription}}=client.auth.onAuthStateChange((event,s)=>{
     setSession(s);
     if(event==='PASSWORD_RECOVERY'){setPasswordMode(true)}
     if(event==='SIGNED_OUT'){setSettings(null);setEntries([]);setLoaded(false)}
   });
   return ()=>subscription.unsubscribe();
 },[]);
 const loadData=useCallback(async()=>{
   if(!supabase||!session)return;
   const client=supabase;
   try{
     const init=await client.rpc('acumula_initialize');if(init.error)throw init.error;
     const s=await client.from('user_settings').select('balance_cents,theme').single();
     if(s.error)throw s.error;
     const meals:Meal[]=[];
     for(let offset=0;;offset+=1000){
       const page=await client.from('meal_entries')
         .select('id,meal_type,meal_date,meal_time,budget_cents,spent_cents,created_at')
         .order('meal_date',{ascending:false}).order('meal_time',{ascending:false}).order('id',{ascending:false})
         .range(offset,offset+999);
       if(page.error)throw page.error;
       meals.push(...(page.data||[]) as Meal[]);
       if((page.data||[]).length<1000)break;
     }
     const data=s.data as Settings;setSettings(data);setTheme(data.theme);
     setEntries(meals);setLoaded(true);
   }catch(err){setError(errorMessage(err));setLoaded(false)}
 },[session]);
 useEffect(()=>{if(session){void loadData();}else{setLoaded(false)}},[session,loadData]);
 const notify=(message:string)=>{setNotice(message);setError('')};
 const changeMonth=(delta:number)=>{const [y,m]=month.split('-').map(Number);const d=new Date(y,m-1+delta,1,12);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);setShowAll(false)};
 const monthly=useMemo(()=>entries.filter(x=>x.meal_date.startsWith(month)),[entries,month]);
 const totals=useMemo(()=>monthTotals(monthly),[monthly]);
 const todayMeals=entries.filter(x=>x.meal_date===localDate());
 const openMeal=(type:'almoco'|'janta',entry?:Meal)=>{
   const already=entry||todayMeals.find(x=>x.meal_type===type);
   setForm({id:already?.id||null,type:already?.meal_type||type,date:already?.meal_date||localDate(),time:already?.meal_time?.slice(0,5)||localTime(),budget:moneyInput(already?.budget_cents??(type==='almoco'?2000:2500)),spent:moneyInput(already?.spent_cents??0),noSpend:already?already.spent_cents===0:false});
   setError('');setOverdraftConfirm(false);
 };
 const saveMeal=async(e:FormEvent)=>{
   e.preventDefault();if(!supabase||!form)return;
   const b=parseMoney(form.budget),sp=form.noSpend?0:parseMoney(form.spent);
   if(b===null||sp===null){setError('Informe valores válidos em reais, com até duas casas decimais.');return}
   if(!form.date||!form.time){setError('Data e hora são obrigatórias.');return}
   const original=entries.find(x=>x.id===form.id);
   const resultingBalance=(settings?.balance_cents??0)+(original?.spent_cents??0)-sp;
   if(resultingBalance<0&&!overdraftConfirm){setOverdraftConfirm(true);return}
   setIsBusy(true);setError('');
   const {error:rpcError}=await supabase.rpc('acumula_save_meal',{p_id:form.id,p_type:form.type,p_date:form.date,p_time:form.time,p_budget:b,p_spent:sp,p_allow_negative:overdraftConfirm});
   setIsBusy(false);
   if(rpcError){setError(errorMessage(rpcError));return}
   setForm(null);setOverdraftConfirm(false);setMonth(form.date.slice(0,7));await loadData();notify('Refeição salva com sucesso.');
 };
 const removeMeal=async(entry:Meal)=>{
   if(!supabase)return;
   if(!window.confirm(`Excluir ${labelMeal(entry.meal_type).toLowerCase()} de ${keyDate(entry.meal_date)}? O gasto de ${brl(entry.spent_cents)} será devolvido ao saldo disponível.`))return;
   setIsBusy(true);setError('');const {error:e}=await supabase.rpc('acumula_delete_meal',{p_id:entry.id});setIsBusy(false);
   if(e){setError(errorMessage(e));return}await loadData();notify('Registro excluído e saldo ajustado.');
 };
 const saveBalance=async(e:FormEvent)=>{
   e.preventDefault();if(!supabase)return;const value=parseMoney(newBalance);if(value===null){setError('Informe um saldo válido e não negativo.');return}
   setIsBusy(true);setError('');const {error:e2}=await supabase.rpc('acumula_set_balance',{p_balance:value});setIsBusy(false);
   if(e2){setError(errorMessage(e2));return}setBalanceEditor(false);await loadData();notify('Saldo atualizado sem alterar o histórico.');
 };
 const toggleTheme=async()=>{
   const next=theme==='light'?'dark':'light';setTheme(next);setMenuOpen(false);
   if(supabase&&session){const {error:e}=await supabase.rpc('acumula_set_theme',{p_theme:next});if(e)setError('Tema alterado neste dispositivo, mas não foi possível salvá-lo na nuvem.');}
 };
 const authAction=async(e:FormEvent)=>{
   e.preventDefault();if(!supabase)return;setIsBusy(true);setError('');setNotice('');
   const result=resetMode?await supabase.auth.resetPasswordForEmail(authEmail,{redirectTo:window.location.origin}):await supabase.auth.signInWithPassword({email:authEmail,password:authPassword});
   setIsBusy(false);if(result.error){setError(errorMessage(result.error));return}
   if(resetMode){setResetMode(false);notify('Se existir uma conta com esse e-mail, você receberá instruções para recuperar sua senha.');}
 };
 const updatePassword=async(e:FormEvent)=>{e.preventDefault();if(!supabase)return;if(newPassword.length<8){setError('Use uma senha de pelo menos 8 caracteres.');return}setIsBusy(true);const {error:e2}=await supabase.auth.updateUser({password:newPassword});setIsBusy(false);if(e2){setError(errorMessage(e2));return}setPasswordMode(false);setNewPassword('');notify('Senha alterada com sucesso.');};
 const signOut=async()=>{if(!supabase)return;setMenuOpen(false);setIsBusy(true);const {error:e}=await supabase.auth.signOut();setIsBusy(false);if(e)setError(errorMessage(e));else{setNotice('');setError('')}};
 const formBudget=form?parseMoney(form.budget):null;
 const formSpent=form?(form.noSpend?0:parseMoney(form.spent)):null;
 const formProfit=formBudget!==null&&formSpent!==null?profit(formBudget,formSpent):null;
 const formOverage=formBudget!==null&&formSpent!==null?overage(formBudget,formSpent):null;
 const grouped=useMemo(()=>{const map=new Map<string,Meal[]>();for(const x of monthly){if(!map.has(x.meal_date))map.set(x.meal_date,[]);map.get(x.meal_date)!.push(x)}return [...map.entries()]},[monthly]);
 const shownGroups=showAll?grouped:grouped.slice(0,8);
 if(!configured)return <div className="setup"><div className="brand-mark"><Coins size={27}/></div><h1>Acumula</h1><h2>Configuração inicial necessária</h2><p>O código do site está pronto para conexão. Configure seu projeto Supabase e preencha as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> na Vercel, conforme o README.</p><p>Por segurança, o site não simula uma conta nem salva dados fictícios.</p></div>;
 if(authLoading)return <div className="center-screen"><span className="spinner"/> Carregando Acumula…</div>;
 if(!session)return <div className="auth-page"><div className="auth-shell"><div className="auth-intro"><div className="brand-mark"><Coins size={25}/></div><span className="brand-text">acumula<span>.</span></span><h1>Seu dinheiro, com mais clareza.</h1><p>Um espaço privado para acompanhar seu saldo, suas refeições e tudo o que você consegue economizar.</p><div className="privacy-note"><ShieldCheck size={18}/> Seus dados ficam protegidos na sua conta.</div></div><form className="auth-card" onSubmit={authAction}><div className="card-top-label">ACESSO PRIVADO</div><h2>{resetMode?'Recuperar acesso':'Boas-vindas de volta'}</h2><p>{resetMode?'Enviaremos um link de recuperação ao e-mail cadastrado.':'Entre com sua conta para continuar.'}</p><label>E-mail<input autoComplete="email" type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required placeholder="voce@exemplo.com"/></label>{!resetMode&&<label>Senha<input type="password" autoComplete="current-password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} required placeholder="Sua senha"/></label>}{error&&<p className="alert error">{error}</p>}{notice&&<p className="alert ok">{notice}</p>}<button className="primary-btn full" disabled={isBusy} type="submit">{isBusy?'Aguarde…':resetMode?'Enviar link':'Entrar no Acumula'} <ArrowRight size={17}/></button><button type="button" className="link-btn" onClick={()=>{setResetMode(!resetMode);setError('')}}>{resetMode?'Voltar ao login':'Esqueci minha senha'}</button></form></div></div>;
 return <div className="app-shell">
  <header className="app-header"><div className="header-inner"><div className="brand"><span className="brand-mark small"><Coins size={21}/></span><span className="brand-text">acumula<span>.</span></span></div><div className="header-actions"><span className="protected-label"><ShieldCheck size={15}/> Espaço privado</span><button className="icon-btn" aria-label={theme==='light'?'Ativar modo escuro':'Ativar modo claro'} onClick={toggleTheme}>{theme==='light'?<Moon size={20}/>:<Sun size={20}/>}</button><div className="menu-anchor"><button className="icon-btn" aria-label="Abrir menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}><Menu size={21}/></button>{menuOpen&&<div className="menu-popover"><button onClick={toggleTheme}>{theme==='light'?<Moon size={17}/>:<Sun size={17}/>} Modo {theme==='light'?'escuro':'claro'}</button><button onClick={signOut}><LogOut size={17}/> Sair da conta</button></div>}</div></div></div></header>
  <main className="main"><div className="welcome"><div><span className="eyebrow">SEU CONTROLE FINANCEIRO</span><h1>Visão geral <span className="wave">✦</span></h1><p>Organize seus gastos e veja suas economias crescerem.</p></div><span className="today-date"><CalendarDays size={16}/>{dateTitleFmt.format(new Date())}</span></div>
   {error&&<div className="alert error banner" role="alert">{error}<button aria-label="Fechar erro" onClick={()=>setError('')}><X size={17}/></button></div>}
   {notice&&<div className="alert ok banner" role="status">{notice}<button aria-label="Fechar aviso" onClick={()=>setNotice('')}><X size={17}/></button></div>}
   {!loaded?<div className="loading-card"><span className="spinner"/> Carregando seus dados…</div>:<>
    <section className="stats-grid" aria-label="Resumo financeiro"><div className="balance-card"><div className="stat-head"><span className="balance-icon"><Wallet size={19}/></span><span>SEU DINHEIRO</span></div><p className="balance-label">Saldo disponível</p><strong className="balance-value">{brl(settings?.balance_cents??0)}</strong><div className="balance-bottom"><span>Valor atualizado conforme seus gastos</span><button onClick={()=>{setNewBalance(moneyInput(settings?.balance_cents??0));setBalanceEditor(true);setError('')}}><Edit3 size={15}/> Editar saldo</button></div><div className="balance-deco"/></div>
    <div className="small-stat profit-stat"><div className="stat-line"><span className="stat-icon green"><TrendingUp size={20}/></span><span className="period-tag">NO MÊS</span></div><p>Lucro acumulado</p><strong>{brl(totals.profit)}</strong><span className="stat-sub">O que você conseguiu economizar</span></div>
    <div className="small-stat spend-stat"><div className="stat-line"><span className="stat-icon orange"><ArrowDownRight size={20}/></span><span className="period-tag">NO MÊS</span></div><p>Total gasto</p><strong>{brl(totals.spent)}</strong><span className="stat-sub">Em almoço e janta</span></div></section>
    <section className="quick-section"><div className="section-heading"><div><h2>Registrar refeição</h2><p>Como foi sua alimentação hoje?</p></div><span className="subtle-label">{keyDate(localDate())}</span></div><div className="meal-buttons"><button onClick={()=>openMeal('almoco')} className="meal-button"><span className="meal-icon lunch"><Sun size={21}/></span><span className="meal-button-text"><strong>Almoço</strong><small>{todayMeals.some(x=>x.meal_type==='almoco')?'Registrado · toque para editar':'Orçamento padrão · R$ 20,00'}</small></span>{todayMeals.some(x=>x.meal_type==='almoco')?<Check size={19} className="action-check"/>:<Plus size={20}/>}</button><button onClick={()=>openMeal('janta')} className="meal-button"><span className="meal-icon dinner"><Moon size={21}/></span><span className="meal-button-text"><strong>Janta</strong><small>{todayMeals.some(x=>x.meal_type==='janta')?'Registrada · toque para editar':'Orçamento padrão · R$ 25,00'}</small></span>{todayMeals.some(x=>x.meal_type==='janta')?<Check size={19} className="action-check"/>:<Plus size={20}/>}</button></div></section>
    <section className="history-section"><div className="section-heading history-heading"><div><h2>Histórico de refeições</h2><p>Acompanhe seus registros e resultados</p></div><div className="month-picker"><button onClick={()=>changeMonth(-1)} aria-label="Mês anterior"><ChevronLeft size={18}/></button><span>{monthFmt.format(isoLocal(`${month}-01`))}</span><button onClick={()=>changeMonth(1)} aria-label="Próximo mês"><ChevronRight size={18}/></button></div></div><div className="history-panel">{grouped.length===0?<div className="empty-history"><span><UtensilsCrossed size={27}/></span><h3>Nenhuma refeição registrada neste mês</h3><p>Seus registros aparecerão aqui assim que você salvar um almoço ou uma janta.</p></div>:<>{shownGroups.map(([date,meals])=><div className="day-group" key={date}><div className="day-head"><strong>{dateFmt.format(isoLocal(date))}</strong><span>{brl(meals.reduce((a,x)=>a+x.spent_cents,0))} gastos · {brl(meals.reduce((a,x)=>a+profit(x.budget_cents,x.spent_cents),0))} lucro</span></div>{meals.map(item=><div className="history-item" key={item.id}><div className="history-icon">{item.meal_type==='almoco'?<Sun size={19}/>:<Moon size={19}/>}</div><div className="history-details"><strong>{labelMeal(item.meal_type)}</strong><small><Clock3 size={12}/>{item.meal_time.slice(0,5)} · Previsto {brl(item.budget_cents)} · Gasto {brl(item.spent_cents)}</small></div><div className="history-result">{profit(item.budget_cents,item.spent_cents)>0?<span className="result-profit">+ {brl(profit(item.budget_cents,item.spent_cents))}<small>lucro</small></span>:overage(item.budget_cents,item.spent_cents)>0?<span className="result-over">{brl(overage(item.budget_cents,item.spent_cents))}<small>gastou a mais · sem lucro</small></span>:<span className="result-neutral">Sem lucro<small>R$ 0,00</small></span>}</div><div className="entry-actions"><button aria-label={`Editar ${labelMeal(item.meal_type)}`} title="Editar" onClick={()=>openMeal(item.meal_type,item)}><Edit3 size={16}/></button><button aria-label={`Excluir ${labelMeal(item.meal_type)}`} title="Excluir" onClick={()=>void removeMeal(item)} disabled={isBusy}><Trash2 size={16}/></button></div></div>)}</div>)}{grouped.length>8&&<button className="show-more" onClick={()=>setShowAll(!showAll)}>{showAll?'Mostrar menos':'Ver todos os dias'} <ChevronDown size={16}/></button>}</>}</div></section>
    <footer className="footer"><ShieldCheck size={15}/> Seus dados são privados e salvos na nuvem. <span>Acumula © {new Date().getFullYear()}</span></footer>
   </>}
  </main>
  {balanceEditor&&<div className="modal-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setBalanceEditor(false)}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="balance-title"><div className="modal-head"><div><span className="eyebrow">CONTROLE DO SALDO</span><h2 id="balance-title">Editar saldo disponível</h2></div><button className="icon-btn" aria-label="Fechar" onClick={()=>setBalanceEditor(false)}><X size={20}/></button></div><form onSubmit={saveBalance}><p className="modal-hint">Informe quanto dinheiro você tem para gastar. Isso substitui o saldo atual, sem alterar nenhum gasto ou lucro já registrado.</p><label className="field">Novo saldo (R$)<input autoFocus value={newBalance} inputMode="decimal" onChange={e=>setNewBalance(e.target.value)} placeholder="0,00" required/></label>{error&&<p className="alert error">{error}</p>}<div className="modal-actions"><button className="secondary-btn" type="button" onClick={()=>setBalanceEditor(false)}>Cancelar</button><button className="primary-btn" type="submit" disabled={isBusy}>{isBusy?'Salvando…':'Salvar saldo'} <Check size={16}/></button></div></form></div></div>}
  {form&&<div className="modal-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setForm(null)}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="meal-title"><div className="modal-head"><div><span className="eyebrow">{form.id?'EDITAR REGISTRO':'NOVO REGISTRO'}</span><h2 id="meal-title">{form.id?'Editar':'Registrar'} {labelMeal(form.type).toLowerCase()}</h2></div><button className="icon-btn" onClick={()=>setForm(null)} aria-label="Fechar"><X size={20}/></button></div><form onSubmit={saveMeal}><div className="form-grid"><label className="field">Orçamento (R$)<input value={form.budget} inputMode="decimal" onChange={e=>{setForm({...form,budget:e.target.value});setOverdraftConfirm(false)}} required/></label><label className="field">Quanto gastou (R$)<input value={form.noSpend?'0,00':form.spent} inputMode="decimal" disabled={form.noSpend} onChange={e=>{setForm({...form,spent:e.target.value});setOverdraftConfirm(false)}} required/></label></div><label className="check-row"><input type="checkbox" checked={form.noSpend} onChange={e=>{setForm({...form,noSpend:e.target.checked});setOverdraftConfirm(false)}}/><span>Não gastei nada <small>Lucro de 100% do orçamento</small></span></label><div className="form-grid"><label className="field">Data<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required/></label><label className="field">Horário<input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} required/></label></div><div className={`result-preview ${formProfit===null?'':formProfit>0?'positive':formOverage&&formOverage>0?'negative':'neutral'}`}><div><span>RESULTADO DA REFEIÇÃO</span><strong>{formProfit===null?'Valor inválido':formProfit>0?'Teve lucro':formOverage&&formOverage>0?'Gastou a mais':'Sem lucro'}</strong></div><b>{formProfit===null?'—':formProfit>0?`+ ${brl(formProfit)}`:formOverage&&formOverage>0?brl(formOverage):brl(0)}</b></div>{overdraftConfirm&&<div className="alert warning"><strong>Atenção: saldo insuficiente.</strong> O registro deixará seu saldo disponível negativo. Se desejar continuar, confirme no botão abaixo.</div>}{error&&<p className="alert error">{error}</p>}<div className="modal-actions"><button className="secondary-btn" type="button" onClick={()=>setForm(null)}>Cancelar</button><button className="primary-btn" disabled={isBusy} type="submit">{isBusy?'Salvando…':overdraftConfirm?'Confirmar saldo negativo':form.id?'Salvar alterações':'Salvar refeição'} <Check size={16}/></button></div></form></div></div>}
  {passwordMode&&<div className="modal-overlay"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="password-title"><div className="modal-head"><h2 id="password-title">Definir nova senha</h2><button className="icon-btn" aria-label="Fechar" onClick={()=>setPasswordMode(false)}><X size={20}/></button></div><form onSubmit={updatePassword}><label className="field">Nova senha<input type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></label>{error&&<p className="alert error">{error}</p>}<div className="modal-actions"><button className="primary-btn" disabled={isBusy}>Atualizar senha</button></div></form></div></div>}
 </div>;
}
export default App;
