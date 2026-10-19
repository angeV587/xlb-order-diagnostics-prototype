'use strict';
(() => {
  const D = window.DIAG_DATA;
  if (!D || !D.scenarios?.length) { document.getElementById('results').textContent = '示例数据未加载，请刷新页面。'; return; }
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names = { pass:'通过', fail:'不满足', risk:'需关注', unknown:'无法判断', na:'不适用' };
  const icons = { pass:'✓', fail:'!', risk:'!', unknown:'?', na:'—' };
  const st = {view:'config', scenario:'directPlain', store:D.stores[0]?.id || '', supplier:D.suppliers[0]?.id || '', warehouse:'', products:D.products.map(p=>p.id), ran:false, filter:'all', keyword:'', productFilter:'all', repaired:new Set(), role:'full', variant:'attention', doc:'', health:null, selectedNode:0, time:'', configs:[], context:null, returnFocus:null};
  const scene = () => D.scenarios.find(s=>s.id===st.scenario) || D.scenarios[0];
  const find = (list,id) => list.find(x=>x.id===id);
  const label = (list,id,fallback='未选择') => find(list,id)?.name || fallback;
  const badge = (status,text) => `<span class="status ${esc(status)}">${icons[status] || '·'} ${esc(text || names[status] || status)}</span>`;
  const now = () => new Date().toLocaleString('zh-CN',{hour12:false});
  function toast(text) { $('toast').textContent=text; $('toast').classList.remove('hidden'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('toast').classList.add('hidden'),2600); }
  function setView(view) { st.view=view; closeDrawer(); closeModal(); location.hash=view; render(); }
  function scenarioOptions() { return D.scenarios.map(s=>`<option value="${esc(s.id)}" ${s.id===st.scenario?'selected':''}>${esc(s.name)}</option>`).join(''); }
  function picker(kind,title,value) { const lists={store:D.stores,supplier:D.suppliers,warehouse:D.warehouses}; return `<div class="picker"><input id="${kind}Display" aria-label="${title}" value="${esc(value ? label(lists[kind],value) : kind==='warehouse'?'按商品自动识别实际发货仓':'请选择'+title)}" readonly><button class="input-button" data-picker="${kind}" aria-label="选择${title}">⌕</button></div>`; }
  function render() {
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===st.view));
    $('query').textContent=st.view==='config'?'⌕ 开始检查':'⌕ 开始体检';
    $('export').disabled=!st.ran || (st.view==='health' && !st.health);
    $('introAnnotation').textContent=st.view==='config'?'① 选择业务场景并填写下单对象。② 先查看各商品能否下单，再检查具体不满足项；不是只给一张红绿清单。':'① 只需输入单据号，自动识别业务场景。② 从来源到完成展示整个生命周期，标出已完成、当前停留、待执行和无法判断的步骤。';
    if(st.view==='config') renderConfigForm(); else renderHealthForm();
    renderResults();
  }
  function renderConfigForm() {
    const s=scene();
    $('form').innerHTML=`<div class="filters"><label class="field"><span class="required">业务场景</span><select id="scenario" aria-label="业务场景">${scenarioOptions()}</select></label><div class="field"><label class="required" for="storeDisplay">要货门店</label>${picker('store','要货门店',st.store)}</div>${s.needsSupplier?`<div class="field"><label class="required" for="supplierDisplay">供应商</label>${picker('supplier','供应商',st.supplier)}</div>`:`<div class="field"><label for="warehouseDisplay">发货配送中心</label>${picker('warehouse','发货配送中心',st.warehouse)}</div>`}<div class="field"><label class="required" for="productDisplay">商品</label><div class="picker"><input id="productDisplay" aria-label="商品" value="${esc(st.products.map(id=>label(D.products,id)).join('、'))}" placeholder="请选择商品，可多选" readonly><button class="input-button" data-picker="products" aria-label="选择商品">⌕</button></div></div></div><p class="support-note">${esc(s.description)}<br>本页检查所选场景的下单配置与准入条件；检查结果不代表已创建订单或已预留库存、资金。</p>`;
    $('scenario').onchange=e=>{st.scenario=e.target.value;st.ran=false;st.configs=[];st.filter='all';st.productFilter='all';st.keyword='';st.context=null;render();};
    document.querySelectorAll('[data-picker]').forEach(b=>b.onclick=()=>openPicker(b.dataset.picker));
  }
  function renderHealthForm() {
    $('form').innerHTML=`<div class="filters" style="grid-template-columns:minmax(340px,600px) 1fr"><label class="field"><span class="required">单据号</span><input id="docNumber" aria-label="单据号" placeholder="输入门店订单号或相关来源单号" value="${esc(st.doc)}" autocomplete="off"></label><div class="field"><button class="link" id="sampleLink">不知道如何开始？选择一个示例单据</button></div></div><p class="support-note">自动识别场景，追踪来源、生成、审核、履约、收货与结束。未生成门店订单时，也可使用预订单、统配单、补发申请等来源单号。</p>`;
    $('docNumber').oninput=e=>{st.doc=e.target.value;st.ran=false;st.health=null;renderResults();};
    $('docNumber').onkeydown=e=>{if(e.key==='Enter')run();};
    $('sampleLink').onclick=openExamples;
  }
  function resultItem(c,key,product) {
    const r={...c,key,product:product?.name||'全部所选商品',productId:product?.id||'all'};
    if (st.repaired.has(key)) {r.status='pass';r.actual='已满足示例条件';r.reason='已在配置演示页完成调整，并重新读取检查结果。';r.suggestion='当前检查项已通过。';r.repairable=false;}
    if (st.role==='limited' && r.sensitive) {r.status='unknown';r.actual='无查看权限';r.expected='受权限限制';r.reason='当前演示角色无权查看该项依据，无法完成此项判断。';r.suggestion='请具备相应权限的岗位核查；本结果不推断敏感数据。';r.repairable=false;}
    return r;
  }
  function buildConfigRows() {
    const s=scene();const rows=[];
    st.products.forEach((pid,pidx)=>{
      const p=find(D.products,pid);
      s.checks.forEach((c,i)=>{
        const item=resultItem(c,`${s.id}:${st.store}:${st.supplier}:${st.warehouse}:${pid}:${c.id}`,p);
        // Match each fixture to its named product, never turn a failed product into a different product's result.
        const productScope=(c.scope.match(/商品[A-D]/)||c.actual.match(/商品[A-D]/)||[])[0];
        item.name=item.name.replace(/商品[A-D]/g,p.name);
        if(productScope && productScope!==p.name) {item.status='pass';item.actual='满足本次示例条件';item.reason='该商品在此示例中的配置满足要求。';item.suggestion='无需处理。';item.repairable=false;}
        if(s.id==='directPlain'&&c.id==='dp-main-supplier'&&p.name==='商品A'&&!st.repaired.has(`${s.id}:${st.store}:${st.supplier}:${st.warehouse}:${pid}:dp-supply`)){item.status='na';item.actual='供货关系尚未建立';item.reason='前置供货关系缺失，主供应商检查暂不执行，不计为通过。';item.suggestion='先补齐供货关系，再重新检查主供应商。';item.repairable=false;}
        ['actual','reason','scope'].forEach(field=>{item[field]=String(item[field]).replace(/示例门店A/g,label(D.stores,st.store)).replace(/示例供应商A/g,label(D.suppliers,st.supplier));});
        if(st.role==='limited'&&item.sensitive){item.status='unknown';item.actual='无查看权限';item.expected='受权限限制';item.reason='无法取得授权范围内的判定依据，本项不能视为通过。';item.suggestion='请具备权限的岗位核查。';item.repairable=false;}
        rows.push(item);
      });
    });
    return rows;
  }
  function run() {
    closeDrawer();closeModal();
    if(st.view==='config') {
      const s=scene();
      if(!st.store || !st.products.length || (s.needsSupplier && !st.supplier)) {toast('请先选择要货门店、商品及当前场景必需的供应商。');return;}
      st.configs=buildConfigRows();st.context={scenario:s.name,store:label(D.stores,st.store),supplier:s.needsSupplier?label(D.suppliers,st.supplier):'不涉及',warehouse:st.warehouse?label(D.warehouses,st.warehouse):'按商品路由自动识别',products:st.products.slice()};
    } else {
      if(!st.doc.trim()) {toast('请输入单据号，或载入一个示例单据。');return;}
      let found=null;
      const candidates=D.scenarios.flatMap(s=>[{s,h:s.health,variant:'attention'},{s,h:s.normalHealth,variant:'normal'}]);
      found=candidates.find(x=>[x.h?.sourceNo,x.h?.orderNo].filter(Boolean).includes(st.doc.trim()));
      if(!found)found=candidates.find(x=>x.h?.related?.some(r=>r.no===st.doc.trim()));
      if(found){st.scenario=found.s.id;st.variant=found.variant;st.health=JSON.parse(JSON.stringify(found.h));st.selectedNode=Math.max(0,st.health.timeline.findIndex(n=>n.status==='unknown'||n.status==='current'));st.healthContext={store:D.stores[0].id,supplier:D.suppliers[0].id,warehouse:'',products:D.products.filter(p=>JSON.stringify(found.h).includes(p.name)).map(p=>p.id)};if(!st.healthContext.products.length)st.healthContext.products=[D.products[0].id];}else st.health=null;
    }
    st.time=now();st.ran=true;st.filter='all';st.keyword='';st.productFilter='all';render();
  }
  function count(rows) {return rows.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a;},{pass:0,fail:0,risk:0,unknown:0,na:0});}
  function decision(rows) {const c=count(rows);return c.fail?'fail':c.unknown?'unknown':c.risk?'risk':'pass';}
  function decisionLabel(status) {return {fail:'不能下单',unknown:'暂无法判断',risk:'可以下单，有关注项',pass:'可以下单'}[status];}
  function filterTabs(rows) {const c=count(rows);return `<div class="result-tabs" role="group" aria-label="检查结果筛选">${[['all','全部',rows.length],['fail','不满足',c.fail],['risk','需关注',c.risk],['unknown','无法判断',c.unknown],['pass','通过',c.pass],['na','不适用',c.na]].map(([id,text,n])=>`<button class="result-tab ${st.filter===id?'active':''}" data-filter="${id}">${text} <span>${n}</span></button>`).join('')}<span class="spacer"></span><input id="resultKeyword" aria-label="搜索检查项" placeholder="搜索检查项或原因" value="${esc(st.keyword)}" style="max-width:180px"></div>`;}
  function renderResults() {
    $('export').disabled=!st.ran || (st.view==='health'&&!st.health);
    if(!st.ran) {$('results').innerHTML=`<div class="empty"><div style="font-size:24px;margin-bottom:12px">⌕</div>${st.view==='config'?'填写条件后开始检查，查看每个商品能否下单及具体原因。':'输入单据号后开始体检，查看单据的整个生命周期。'}<p><button class="link" id="emptyExample">载入示例，体验完整流程</button></p></div>`;$('emptyExample').onclick=openExamples;return;}
    if(st.view==='config')renderConfigResults();else renderHealthResults();
  }
  function renderConfigResults() {
    const rows=st.configs,overall=decision(rows),ctx=st.context;const visibleBase=rows.filter(r=>st.productFilter==='all'||r.productId===st.productFilter);
    const productResults=ctx.products.map(pid=>({p:find(D.products,pid),rows:rows.filter(r=>r.productId===pid)}));
    $('results').innerHTML=`<div class="annotation">③ 先给商品级下单结论；不满足项展开查看实际值、要求及处理入口。④ 点击配置入口后，在原型中模拟处理，再保留原查询条件复查。</div><div class="section-title">检查结果</div><div class="summary ${overall}"><div class="summary-icon">${icons[overall]}</div><div class="summary-main"><strong>${overall==='fail'?'部分商品不能下单':overall==='unknown'?'部分检查无法完成':overall==='risk'?'配置满足，仍有关注事项':'所选商品配置满足，可以下单'}</strong><p>${esc(ctx.store)}　${ctx.supplier!=='不涉及'?'→ '+esc(ctx.supplier):'· '+esc(ctx.warehouse)}　｜　${esc(ctx.scenario)}</p></div><div class="muted">检查时间：${esc(st.time)}</div></div><div class="table-wrap"><table aria-label="商品下单结论"><thead><tr><th>商品</th><th data-column="status">能否下单</th><th>具体原因</th><th>操作</th></tr></thead><tbody>${productResults.map(({p,rows:rs})=>{const status=decision(rs),issues=rs.filter(r=>['fail','unknown'].includes(r.status));const concerns=rs.filter(r=>r.status==='risk');return `<tr><td>${esc(p.name)} <small class="muted">DEMO-${D.products.indexOf(p)+1}</small></td><td>${badge(status,decisionLabel(status))}</td><td>${issues.length?issues.map(r=>esc(r.reason)).join('；'):concerns.length?'本次下单配置满足；另有'+concerns.length+'项后续业务关注事项':'本次已支持的配置与准入检查均满足'}</td><td><button class="link" data-product-detail="${esc(p.id)}">查看检查项</button></td></tr>`;}).join('')}</tbody></table></div><div class="section-title">配置检查明细</div>${st.productFilter!=='all'?'<p class="support-note">当前商品：'+esc(label(D.products,st.productFilter))+'；结果数量按此商品统计。</p>':''}${filterTabs(visibleBase)}<div class="table-wrap"><table aria-label="配置检查明细"><thead><tr><th>序号</th><th>商品</th><th>检查项</th><th data-column="status">结果</th><th>当前配置 / 实际值</th><th>不满足原因 / 说明</th><th>操作</th></tr></thead><tbody id="configRows"></tbody></table></div><div class="pagination"><span id="configTotal"></span><span class="spacer"></span><span class="muted">完整显示本次检查结果</span></div><p class="support-note">“可下单”表示本次配置与准入检查满足；正式保存、审核时仍以当时实际校验为准。未完成的检查不会计为通过。</p>`;
    renderConfigRows();
    document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{st.filter=b.dataset.filter;renderConfigResults();});
    document.querySelectorAll('[data-product-detail]').forEach(b=>b.onclick=()=>{st.productFilter=b.dataset.productDetail;st.filter='all';renderConfigResults();});
    $('resultKeyword').oninput=e=>{st.keyword=e.target.value;renderConfigRows();};
  }
  function renderConfigRows() {
    const shown=st.configs.filter(r=>(st.filter==='all'||r.status===st.filter)&&(st.productFilter==='all'||r.productId===st.productFilter)&&(!st.keyword||(r.name+r.actual+r.reason+r.product).includes(st.keyword)));
    $('configRows').innerHTML=shown.length?shown.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.product)}</td><td>${esc(r.name)}<small class="muted" style="display:block">${esc(r.category)}</small></td><td>${badge(r.status)}</td><td>${esc(r.actual)}</td><td>${esc(r.reason)}</td><td><div class="table-actions"><button class="link" data-detail="${esc(r.key)}">详情</button><button class="link" data-target="${esc(r.key)}">去查看配置</button></div></td></tr>`).join(''):'<tr><td class="empty" colspan="7">没有符合筛选条件的检查项</td></tr>';
    $('configTotal').innerHTML=`共 ${shown.length} 项${st.productFilter!=='all'?`　<button class="link" id="allProducts">显示全部商品</button>`:''}`;
    if($('allProducts'))$('allProducts').onclick=()=>{st.productFilter='all';renderConfigResults();};
    document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>openCheck(st.configs.find(r=>r.key===b.dataset.detail)));
    document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>openTarget(st.configs.find(r=>r.key===b.dataset.target)));
  }
  function healthRows() {return (st.health?.findings||[]).map(c=>resultItem(c,`health:${st.scenario}:${c.id}`));}
  function renderHealthResults() {
    if(!st.health){$('results').innerHTML=`<div class="summary unknown"><div class="summary-icon">?</div><div class="summary-main"><strong>未找到该示例单据，无法完成体检</strong><p>本原型仅支持内置的虚构单号；未找到不代表实际业务中不存在该单据。</p><button class="link" id="notFoundExample">选择一个示例单据</button></div></div>`;$('notFoundExample').onclick=openExamples;return;}
    const h=st.health, s=scene(), rows=healthRows(), severity=decision(rows), c=count(rows);const headline=st.role==='limited'&&h.findings.some(r=>r.sensitive)?'当前权限下未完成全部体检，受限项无法判断。已取得的生命周期记录如下。':h.summary;const noOrder=h.orderNo?'':/不生成|无需生成|不应生成|不要求生成|无.*生成要求|零建议/.test(h.summary+h.stalledAt+h.findings.map(r=>r.actual+' '+r.reason).join(' '))?'本例不要求生成':'未生成，原因见下方生命周期';
    $('results').innerHTML=`<div class="section-title">单据信息</div><div class="meta-grid"><div class="meta-field">查询单号：<strong>${esc(st.doc)}</strong></div><div class="meta-field">体检主单：<strong>${esc(h.sourceNo)}</strong></div><div class="meta-field">识别场景：<strong>${esc(s.name)}</strong></div><div class="meta-field">门店：<strong>示例门店A</strong></div><div class="meta-field">单据状态：<strong>${esc(h.orderStatus)}</strong></div><div class="meta-field">履约状态：<strong>${esc(h.logisticsStatus)}</strong></div><div class="meta-field">关联门店订单：<strong>${esc(h.orderNo||noOrder)}</strong></div></div><div class="summary ${severity}"><div class="summary-icon">${icons[severity]}</div><div class="summary-main"><strong>${esc(headline)}</strong><p>当前环节：${esc(h.stalledAt)}　｜　不满足 ${c.fail} 项 · 需关注 ${c.risk} 项 · 无法判断 ${c.unknown} 项</p></div><span class="muted">体检时间：${esc(st.time)}</span></div><div class="annotation">③ 按单据生命周期展示已完成、当前停留及后续步骤，点击节点查看依据。④ 停留超期先标关注；是否应作废、是否任务失败，按场景和执行证据分别判断。</div><div class="section-title">整个生命周期 <small class="muted">点击步骤查看详情</small></div><div class="timeline">${h.timeline.map((n,i)=>`<button class="timeline-node ${esc(n.status)} ${i===st.selectedNode?'selected':''}" data-node="${i}"><span class="timeline-dot">${n.status==='done'?'✓':i+1}</span><strong>${esc(n.name)}</strong><small>${esc({done:'已完成',current:'当前环节',pending:'待执行',unknown:'无法判断'}[n.status]||n.status)}</small><small>${esc(n.time||'—')}</small></button>`).join('')}</div><div class="chain-panel" id="nodeDetail"></div><div class="section-title">异常与关注事项</div><div class="health-findings">${rows.length?rows.map((r,i)=>`<article class="finding ${esc(r.status)}"><div class="finding-head">${badge(r.status)}<strong>${esc(r.name)}</strong><span class="spacer"></span><button class="link" data-health-detail="${i}">查看依据</button>${r.target?`<button class="link" data-health-target="${i}">去查看</button>`:''}</div><div class="finding-body">${esc(r.reason)}<p><span class="muted">处理建议：</span>${esc(r.suggestion)}</p></div></article>`).join(''):'<div class="empty">本次已覆盖的检查未发现异常</div>'}</div><div class="section-title">关联单据</div><div class="table-wrap"><table aria-label="关联单据"><thead><tr><th>单据类型</th><th>单据号</th><th>状态</th><th>关联关系</th><th>操作</th></tr></thead><tbody>${(h.related||[]).map((r,i)=>`<tr><td>${esc(r.type)}</td><td><button class="link" data-related="${i}">${esc(r.no)}</button></td><td>${esc(r.status)}</td><td>${esc(r.relation)}</td><td><button class="link" data-related="${i}">查看单据</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">当前没有已生成的下游单据；请结合生成条件查看原因。</td></tr>'}</tbody></table></div><div class="toolbar" style="margin-top:16px"><button class="btn" id="toConfig">检查该单据当前的下单配置</button><button class="btn" id="historyCompare">查看历史依据与当前配置</button><span class="muted">当前配置检查不能直接还原单据发生时的配置。</span></div>`;
    renderNode();
    document.querySelectorAll('[data-node]').forEach(b=>b.onclick=()=>{st.selectedNode=Number(b.dataset.node);renderHealthResults();});
    document.querySelectorAll('[data-health-detail]').forEach(b=>b.onclick=()=>openCheck(rows[Number(b.dataset.healthDetail)],true));
    document.querySelectorAll('[data-health-target]').forEach(b=>b.onclick=()=>openTarget(rows[Number(b.dataset.healthTarget)],true));
    document.querySelectorAll('[data-related]').forEach(b=>b.onclick=()=>openRelated(h.related[Number(b.dataset.related)]));
    $('toConfig').onclick=()=>{Object.assign(st,st.healthContext);st.ran=false;st.configs=[];st.filter='all';st.productFilter='all';setView('config');toast('已按体检对象带入本例门店、供应商和商品，请开始检查当前配置。');};
    $('historyCompare').onclick=openHistory;
  }
  function renderNode(){const n=st.health.timeline[st.selectedNode];if(!n)return;$('nodeDetail').innerHTML=`<strong>${esc(n.name)}</strong>　${badge({done:'pass',current:'risk',pending:'na',unknown:'unknown'}[n.status]||'unknown')}<p>${esc(n.detail)}</p><div class="muted">${n.docNo?'关联单号：'+esc(n.docNo)+'　｜　':''}记录时间：${esc(n.time||'暂无事件记录')}</div>`;}
  function openDrawer(title,body,foot=''){st.returnFocus=document.activeElement;$('drawerTitle').textContent=title;$('drawerBody').innerHTML=body;$('drawerFoot').innerHTML=foot||'<button class="btn" id="drawerBack">返回</button>';$('drawerOverlay').classList.remove('hidden');$('closeDrawer').focus();if($('drawerBack'))$('drawerBack').onclick=closeDrawer;}
  function closeDrawer(){$('drawerOverlay').classList.add('hidden');if(st.returnFocus?.isConnected)st.returnFocus.focus();}
  function openCheck(r,historical=false){if(!r)return;openDrawer(r.name,`<div class="summary ${r.status}">${badge(r.status)}<strong>${esc(r.reason)}</strong></div><div class="section-title">判定依据</div><div class="detail-grid"><span class="detail-label">检查对象</span><span>${esc(historical?st.doc:r.product+' / '+st.context.store)}</span><span class="detail-label">实际值</span><span>${esc(r.actual)}</span><span class="detail-label">要求 / 示例条件</span><span>${esc(r.expected)}</span><span class="detail-label">检查范围</span><span>${esc(r.scope)}</span><span class="detail-label">检查时间</span><span>${esc(st.time)}</span><span class="detail-label">处理岗位</span><span>${esc(r.owner)}</span><span class="detail-label">处理入口</span><span>${esc(r.target||'需进一步核查')}</span></div><div class="section-title">处理建议</div><p>${esc(r.suggestion)}</p>${historical?'<div class="support-note">本项以示例事件记录判断；缺少历史依据的项目不会依据当前配置反推当时原因。</div>':''}` ,`<button class="btn" id="drawerBack">返回</button><button class="btn primary" id="detailGo">去查看${historical?'相关信息':'配置'}</button>`);$('detailGo').onclick=()=>openTarget(r,historical);}
  function openTarget(r,historical=false){if(!r)return;if(st.role==='limited'){openDrawer('来源信息权限受限',`<div class="summary unknown"><strong>当前演示角色无来源页面查看或编辑权限</strong></div><p>可查看授权范围内的诊断结论；请联系${esc(r.owner||'对应负责岗位')}处理。</p><p class="support-note">不会因拥有诊断入口而自动获得配置修改权限。</p>`);return;}
    const editable=!historical&&r.repairable&&['fail','risk'].includes(r.status);
    openDrawer(r.target||'相关信息',`<div class="prototype-note">来源页面交互示意 · 本页仅演示定位与返回，不连接真实系统。</div><div class="section-title">定位信息</div><div class="detail-grid"><span class="detail-label">检查项</span><span>${esc(r.name)}</span><span class="detail-label">业务场景</span><span>${esc(scene().name)}</span><span class="detail-label">要货门店</span><span>${esc(st.context?.store||'示例门店A')}</span><span class="detail-label">商品</span><span>${esc(r.product||'示例商品A')}</span><span class="detail-label">当前值</span><span>${esc(r.actual)}</span><span class="detail-label">要求</span><span>${esc(r.expected)}</span></div><div class="section-title">配置内容</div>${editable?`<label class="field"><span>模拟调整结果</span><select id="repairValue" aria-label="模拟调整结果"><option value="">保留当前配置</option><option value="satisfy">调整为满足本项示例条件</option></select></label><p class="support-note">保存后返回检查页，再重新检查；仅更新本原型内对应商品、对应检查项的示例状态。</p>`:`<p>${esc(r.suggestion)}</p><p class="support-note">此项为事实查询、等待条件或缺少证据，不提供一键修改业务状态。</p>`}` ,`<button class="btn" id="targetBack">返回${historical?'体检':'检查'}</button>${editable?'<button class="btn primary" id="saveRepair">模拟保存并返回</button>':''}`);
    $('targetBack').onclick=closeDrawer;
    if(editable)$('saveRepair').onclick=()=>{if($('repairValue').value!=='satisfy'){toast('尚未调整配置，请选择演示调整结果。');return;}st.repaired.add(r.key);closeDrawer();run();toast('模拟配置已保存，已保留原条件重新检查。');};
  }
  function openRelated(r){openDrawer('关联单据 · '+r.type,`<div class="section-title">单据基本信息</div><div class="meta-grid"><div>单据号：${esc(r.no)}</div><div>类型：${esc(r.type)}</div><div>状态：${esc(r.status)}</div><div>关联关系：${esc(r.relation)}</div></div><p class="support-note">关联单据为虚构记录，用于演示生命周期追踪。当前节点不提供审核、作废、收货等业务操作。</p>`);}
  function openHistory(){openDrawer('历史依据与当前配置',`<div class="section-title">本次体检采用的依据</div><div class="comparison"><div><strong>单据发生时</strong><p>来源单号：${esc(st.health.sourceNo)}</p><p>已记录的事件、单据状态及关联关系可追溯。</p><p>部分配置未保留历史快照：${badge('unknown','无法还原当时配置')}</p></div><div><strong>当前配置</strong><p>可进入配置检查查询当前生效条件。</p><p>当前已补齐，不等于当时已具备；当前不满足，也不证明当时配置错误。</p></div></div><p class="support-note">本原型不通过当前配置给历史单据补造原因。</p>`);}
  function modal(title,body,foot=''){st.returnFocus=document.activeElement;$('modalTitle').textContent=title;$('modalBody').innerHTML=body;$('modalFoot').innerHTML=foot;$('modalOverlay').classList.remove('hidden');$('closeModal').focus();}
  function closeModal(){$('modalOverlay').classList.add('hidden');if(st.returnFocus?.isConnected)st.returnFocus.focus();}
  function openPicker(kind){const isProducts=kind==='products';const list={store:D.stores,supplier:D.suppliers,warehouse:D.warehouses,products:D.products}[kind];let picked=isProducts?new Set(st.products):new Set(st[kind]?[st[kind]]:[]);modal('选择'+{store:'要货门店',supplier:'供应商',warehouse:'发货配送中心',products:'商品'}[kind],`<div class="chooser-filter"><input id="pickerSearch" aria-label="选择器搜索" placeholder="按名称或代码搜索"></div><div class="table-wrap"><table class="chooser-table"><thead><tr><th>选择</th><th>代码</th><th>名称</th>${isProducts?'<th>单位</th>':''}</tr></thead><tbody id="pickerRows"></tbody></table></div><p class="selected-line" id="pickedCount"></p>`,`<button class="btn" id="pickerCancel">取消</button>${kind==='warehouse'?'<button class="btn" id="autoWarehouse">使用自动路由</button>':''}<button class="btn primary" id="pickerConfirm">确定</button>`);
    const draw=()=>{const q=$('pickerSearch').value.trim();const filtered=list.filter(p=>(p.id+p.name).includes(q));$('pickerRows').innerHTML=filtered.map(p=>`<tr><td><input type="${isProducts?'checkbox':'radio'}" name="pickerItem" aria-label="选择${esc(p.name)}" data-pick="${esc(p.id)}" ${picked.has(p.id)?'checked':''}></td><td>${esc(p.id)}</td><td>${esc(p.name)}</td>${isProducts?`<td>${esc(p.unit)}</td>`:''}</tr>`).join('')||`<tr><td colspan="4" class="empty">没有符合查询条件的数据</td></tr>`;$('pickedCount').textContent='已选择 '+picked.size+' 项';document.querySelectorAll('[data-pick]').forEach(input=>input.onchange=()=>{if(!isProducts)picked.clear();if(input.checked)picked.add(input.dataset.pick);else picked.delete(input.dataset.pick);draw();});};
    draw();$('pickerSearch').oninput=draw;$('pickerCancel').onclick=closeModal;
    $('pickerConfirm').onclick=()=>{if(!picked.size&&kind!=='warehouse'){toast('请至少选择一项。');return;}if(isProducts)st.products=[...picked];else st[kind]=[...picked][0]||'';st.ran=false;st.configs=[];closeModal();render();};
    if($('autoWarehouse'))$('autoWarehouse').onclick=()=>{st.warehouse='';st.ran=false;closeModal();render();};
  }
  function openExamples(){modal(st.view==='health'?'选择示例单据':'选择场景示例',`<p class="support-note">全部为虚构数据。选择后会自动填写并运行，用于比较不同业务的检查方式。</p><div class="table-wrap"><table aria-label="示例场景"><thead><tr><th>场景</th><th>示例说明</th><th>操作</th></tr></thead><tbody>${D.scenarios.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(st.view==='health'?s.health.summary:s.description)}</td><td><div class="table-actions"><button class="link" data-example="${esc(s.id)}" data-variant="attention">需关注示例</button>${st.view==='health'?`<button class="link" data-example="${esc(s.id)}" data-variant="normal">正常 / 等待示例</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`,`<button class="btn" id="exampleCancel">关闭</button>`);$('exampleCancel').onclick=closeModal;document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>loadExample(b.dataset.example,b.dataset.variant));}
  function loadExample(id,variant='attention'){st.scenario=id;st.variant=variant;st.store=D.stores[0].id;st.supplier=D.suppliers[0].id;st.warehouse='';st.products=D.products.map(p=>p.id);st.productFilter='all';st.repaired.clear();if(st.view==='health'){const h=variant==='normal'?scene().normalHealth:scene().health;st.doc=h.sourceNo;}closeModal();run();}
  function settings(){modal('演示设置',`<p class="support-note">仅用于比较原型交互，不修改任何真实账号权限。</p><label class="field"><span>演示角色</span><select id="role" aria-label="演示角色"><option value="full" ${st.role==='full'?'selected':''}>业务人员（有来源查看、编辑及价格权限）</option><option value="limited" ${st.role==='limited'?'selected':''}>业务人员（仅诊断权限）</option></select></label><p>仅诊断权限可看授权结论；敏感依据无法读取时，该项显示“无法判断”，来源页面与配置修改不开放。</p>`,`<button class="btn" id="settingsCancel">取消</button><button class="btn primary" id="settingsSave">应用</button>`);$('settingsCancel').onclick=closeModal;$('settingsSave').onclick=()=>{st.role=$('role').value;closeModal();if(st.ran)run();else render();};}
  function exportResults(){if(!st.ran)return;let rows;if(st.view==='config')rows=[['场景','门店','供应商','商品','检查项','结果','实际值','要求','说明','处理建议','处理入口','检查时间'],...st.configs.map(r=>[st.context.scenario,st.context.store,st.context.supplier,r.product,r.name,names[r.status],r.actual,r.expected,r.reason,r.suggestion,st.role==='limited'?'来源权限受限':r.target,st.time])];else if(st.health)rows=[['单据号','场景','检查项','结果','实际值','要求','说明','处理建议','检查时间'],...healthRows().map(r=>[st.doc,scene().name,r.name,names[r.status],r.actual,r.expected,r.reason,r.suggestion,st.time])];if(!rows)return;const safe=v=>{const s=String(v??'');return /^[=+@-]/.test(s)?"'"+s:s;};const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+safe(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=(st.view==='config'?'配置检查':'单据体检')+'_演示结果.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出本次完整检查结果。');}
  $('query').onclick=run;$('examples').onclick=openExamples;$('export').onclick=exportResults;$('demoSettings').onclick=settings;
  $('reset').onclick=()=>{st.ran=false;st.health=null;st.doc='';st.configs=[];st.filter='all';st.productFilter='all';st.keyword='';st.store='';st.supplier='';st.warehouse='';st.products=[];st.repaired.clear();render();};
  $('annotations').onclick=()=>{document.body.classList.toggle('annotated');$('annotations').textContent=document.body.classList.contains('annotated')?'隐藏标注':'显示标注';};
  $('closeDrawer').onclick=closeDrawer;$('closeModal').onclick=closeModal;
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{const view=b.dataset.view;if(view!==st.view){st.ran=false;st.health=null;st.configs=[];setView(view);}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('modalOverlay').classList.contains('hidden'))closeModal();else closeDrawer();}if(e.key==='Tab'){const container=!$('modalOverlay').classList.contains('hidden')?$('modalOverlay'):!$('drawerOverlay').classList.contains('hidden')?$('drawerOverlay'):null;if(!container)return;const nodes=[...container.querySelectorAll('button:not([disabled]),input,select,[tabindex="0"]')].filter(x=>x.offsetParent!==null);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  const params=new URLSearchParams(location.search);const initial=params.get('view')||location.hash.slice(1);st.view=initial==='health'?'health':'config';const initialScene=params.get('scene');if(D.scenarios.some(s=>s.id===initialScene))st.scenario=initialScene;
  render();loadExample(st.scenario,params.get('sample')==='normal'?'normal':'attention');
})();
