
const { useEffect, useMemo, useRef, useState } = React;

const fmt = new Intl.NumberFormat('en', { notation: 'compact' });

function LogoSvg(){
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.8 6.2L21 11l-6.2 2.8L12 20l-2.8-6.2L3 11l6.2-2.8L12 2z"></path>
      <path d="M12 6v12M6 12h12"></path>
    </svg>
  );
}

function yearsSince(dateString){
  const created = new Date(dateString);
  const now = new Date();
  const years = Math.max(0, Math.floor((now - created) / (365.25 * 24 * 60 * 60 * 1000)));
  return years === 0 ? '<1y' : `${years}y`;
}

function ringColor(score){
  if(score >= 75) return '#52d48b';
  if(score >= 50) return '#f8c25c';
  return '#ff738f';
}

async function fetchJson(url){
  const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
  if(!res.ok){
    if(res.status === 404) throw new Error('GitHub user not found.');
    if(res.status === 403) throw new Error('GitHub API rate limit reached. Try again later.');
    throw new Error('Could not fetch GitHub data.');
  }
  return await res.json();
}

async function fetchText(url){
  const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github.raw+json, application/vnd.github.v3.raw' } });
  if(!res.ok) return '';
  return await res.text();
}

function repoHealth(repo){
  let score = 0;
  if (repo.description) score += 18;
  if (repo.homepage) score += 6;
  if (!repo.fork) score += 12;
  if (repo.stargazers_count > 0) score += Math.min(18, repo.stargazers_count * 2);
  if (repo.forks_count > 0) score += Math.min(12, repo.forks_count * 2);
  if (repo.topics && repo.topics.length) score += Math.min(10, repo.topics.length * 2);
  const days = (Date.now() - new Date(repo.updated_at).getTime()) / (1000 * 60 * 60 * 24);
  if (days < 60) score += 16;
  else if (days < 180) score += 10;
  if (repo.language) score += 8;
  return Math.min(100, score);
}

function buildAnalysis(user, repos, readmeText){
  const languages = {};
  let totalStars = 0, totalForks = 0;
  let describedRepos = 0, recentlyActive = 0, originalRepos = 0, topicsCount = 0;

  repos.forEach((r) => {
    if (r.language) languages[r.language] = (languages[r.language] || 0) + 1;
    totalStars += r.stargazers_count || 0;
    totalForks += r.forks_count || 0;
    if (r.description) describedRepos++;
    if (!r.fork) originalRepos++;
    if ((Date.now() - new Date(r.updated_at).getTime()) / (1000*60*60*24) < 120) recentlyActive++;
    topicsCount += (r.topics || []).length;
  });

  const profileScore = [
    user.avatar_url ? 2 : 0,
    user.bio ? 5 : 0,
    user.location ? 2 : 0,
    user.blog || user.company || user.twitter_username ? 4 : 0,
    readmeText ? 7 : 0
  ].reduce((a,b)=>a+b,0);

  const repoQuality = Math.min(25,
    Math.round((describedRepos / Math.max(repos.length,1)) * 10) +
    Math.round((originalRepos / Math.max(repos.length,1)) * 10) +
    (repos.some((r) => (r.stargazers_count||0) >= 1) ? 5 : 0)
  );

  const docsScore = Math.min(20,
    (readmeText ? 8 : 0) +
    ((topicsCount / Math.max(repos.length,1)) > 1 ? 5 : 2) +
    Math.round((describedRepos / Math.max(repos.length,1)) * 7)
  );

  const activityScore = Math.min(15,
    Math.round((recentlyActive / Math.max(repos.length,1)) * 10) +
    (repos.length >= 3 ? 5 : 2)
  );

  let signalsScore = 0;
  if (totalStars > 10) signalsScore += 6;
  else if (totalStars > 0) signalsScore += 3;
  if (totalForks > 5) signalsScore += 4;
  else if (totalForks > 0) signalsScore += 2;
  signalsScore = Math.min(10, signalsScore);

  const topLangs = Object.entries(languages).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const stackScore = Math.min(10, topLangs.length ? (topLangs[0][1] >= 2 ? 6 : 4) + (topLangs.length <= 4 ? 4 : 2) : 2);
  const total = Math.min(100, profileScore + repoQuality + docsScore + activityScore + signalsScore + stackScore);
  const label = total >= 75 ? 'Excellent' : total >= 50 ? 'Strong' : total >= 30 ? 'Average' : 'Needs Work';

  const repoText = repos.map((r) => `${r.name} ${r.description || ''} ${((r.topics)||[]).join(' ')}`.toLowerCase()).join(' ');
  const langNames = topLangs.map(([k]) => k.toLowerCase());
  const skills = [];
  if (langNames.includes('javascript') || langNames.includes('typescript')) skills.push('Frontend');
  if (repoText.includes('react')) skills.push('React');
  if (repoText.includes('api') || langNames.includes('python') || langNames.includes('java')) skills.push('Backend');
  if (langNames.includes('python')) skills.push('Python');
  if (repoText.includes('node')) skills.push('Node.js');
  if (repoText.includes('tailwind') || repoText.includes('ui')) skills.push('UI Design');
  if (repoText.includes('docker') || repoText.includes('deploy')) skills.push('Deployment');
  if (!skills.length && topLangs.length) skills.push(topLangs[0][0]);

  const strengths = [];
  const weaknesses = [];
  const fit = [];

  if (recentlyActive >= 1) strengths.push('Recent public activity suggests active development.');
  if (describedRepos >= Math.max(2, Math.ceil(repos.length/2))) strengths.push('Repository descriptions make projects easier to review.');
  if (topLangs.length && topLangs[0][1] >= 2) strengths.push(`Clear ${topLangs[0][0]} focus across public repositories.`);

  if (!readmeText) weaknesses.push('No profile README found for first-impression storytelling.');
  if (totalStars < 3) weaknesses.push('Popularity signals are still limited across the profile.');
  if (!user.bio) weaknesses.push('Bio could better explain developer focus and strengths.');

  if (skills.includes('Frontend') || skills.includes('React')) {
    fit.push('Junior Frontend Developer', 'Frontend Internship', 'Web Developer');
  } else if (skills.includes('Python') || skills.includes('Backend')) {
    fit.push('Junior Backend Developer', 'Python Developer', 'Software Engineering Intern');
  } else {
    fit.push('Junior Developer', 'Software Engineering Intern', 'Open Source Contributor');
  }

  const recruiterSummary = total >= 75
    ? 'This profile looks polished and recruiter-friendly, with visible project direction, healthy activity signals, and a clearer technical identity.'
    : total >= 50
      ? 'This profile shows promising work and technical direction, but presentation and documentation could be stronger for faster recruiter trust.'
      : 'This profile shows potential, but it needs better project storytelling, stronger documentation, and more polished showcase repositories.';

  const suggestions = [];
  if (!readmeText) suggestions.push('Add a profile README to improve first impression.');
  if (describedRepos < Math.max(2, repos.length/2)) suggestions.push('Write better descriptions for your key repositories.');
  if (!repos.some((r) => (r.topics||[]).length > 0)) suggestions.push('Add repository topics/tags to highlight stack and purpose.');
  if (recentlyActive < Math.max(1, repos.length/3)) suggestions.push('Update or polish older repos to show recent momentum.');
  if (totalStars === 0) suggestions.push('Pin and present your strongest projects to improve visibility.');
  if (!suggestions.length) suggestions.push('Keep shipping, refine README quality, and showcase one flagship project.');

  const topRepos = [...repos]
    .sort((a,b)=>repoHealth(b) - repoHealth(a) || (b.stargazers_count - a.stargazers_count))
    .slice(0,6)
    .map((r) => ({ ...r, health: repoHealth(r) }));

  const activity = Array.from({length:12}).map((_,i)=>{
    const month = new Date();
    month.setMonth(month.getMonth() - (11 - i));
    const label = month.toLocaleString('en', { month:'short' });
    const count = repos.filter((r) => {
      const d = new Date(r.updated_at);
      return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
    }).length;
    return { label, value: count };
  });

  const heat = Array.from({length:126}).map((_,i)=>{
    const seed = (i * 17 + repos.length * 13 + totalStars * 3) % 10;
    return seed > 8 ? 4 : seed > 6 ? 3 : seed > 3 ? 2 : seed > 1 ? 1 : 0;
  });

  return {
    user, repos, readmeText, totalStars, totalForks, total, label,
    strengths, weaknesses, fit, recruiterSummary, suggestions, topRepos,
    languages: topLangs, skills: [...new Set(skills)].slice(0,8),
    subs: { profileScore, repoQuality, docsScore, activityScore, signalsScore, stackScore },
    activity, heat
  };
}

function ScoreRing({ score, label }){
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const radius = 88;
    let frame = 0;
    let raf = null;

    function draw(val){
      ctx.clearRect(0,0,size,size);

      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(125,141,255,.10)';
      ctx.lineWidth = 16;
      ctx.stroke();

      const end = (-Math.PI/2) + (Math.PI*2)*(val/100);
      ctx.beginPath();
      ctx.arc(center, center, radius, -Math.PI/2, end);
      ctx.strokeStyle = ringColor(score);
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.shadowColor = ringColor(score);
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#eef2ff';
      ctx.font = '800 54px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(val), center, center + 12);

      ctx.fillStyle = '#99a6cf';
      ctx.font = '600 18px Inter';
      ctx.fillText('/100', center, center + 38);

      ctx.fillStyle = ringColor(score);
      ctx.font = '700 18px Inter';
      ctx.fillText(label, center, center + 66);
    }

    function step(){
      frame += 1;
      const val = Math.min(score, score * (frame / 26));
      draw(val);
      if (val < score) raf = requestAnimationFrame(step);
    }
    step();
    return () => cancelAnimationFrame(raf);
  }, [score, label]);

  return <canvas ref={ref} width="260" height="260"></canvas>;
}

function ChartCard({ eyebrow, title, buildChart, deps }){
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !window.Chart) return;
    const chart = buildChart(ref.current.getContext('2d'));
    return () => chart && chart.destroy && chart.destroy();
  }, deps);

  return (
    <div className="card fade">
      <div className="card-inner">
        <div className="eyebrow">{eyebrow}</div>
        <h3 style={{marginTop:12}}>{title}</h3>
        <div className="chart-holder">
          <canvas ref={ref}></canvas>
        </div>
      </div>
    </div>
  );
}

function RepoModal({ repo, onClose }){
  if(!repo) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e)=>e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Repository Details</div>
            <h2 style={{margin:'12px 0 6px', letterSpacing:'-.04em'}}>{repo.name}</h2>
            <div style={{color:'var(--muted)'}}>{repo.description || 'No description added yet.'}</div>
            <div className="badge-row">
              <span className="badge">⭐ {repo.stargazers_count}</span>
              <span className="badge">🍴 {repo.forks_count}</span>
              <span className="badge">🧠 Health {repo.health}/100</span>
              {repo.language && <span className="badge">{repo.language}</span>}
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid-2" style={{marginTop:0}}>
            <div className="info-box">
              <h4>Quick Overview</h4>
              <ul>
                <li>Updated: {new Date(repo.updated_at).toLocaleDateString()}</li>
                <li>Visibility: Public</li>
                <li>Fork: {repo.fork ? 'Yes' : 'No'}</li>
                <li>Homepage: {repo.homepage ? 'Available' : 'Not set'}</li>
              </ul>
            </div>
            <div className="info-box">
              <h4>Recruiter Notes</h4>
              <ul>
                <li>{repo.description ? 'Has a readable description.' : 'Needs a clearer description.'}</li>
                <li>{repo.health >= 70 ? 'Looks showcase-ready.' : repo.health >= 45 ? 'Decent, but can be polished.' : 'Needs presentation and docs work.'}</li>
                <li>{repo.stargazers_count > 0 ? 'Some popularity signal exists.' : 'No popularity signal yet.'}</li>
              </ul>
            </div>
          </div>
          <div className="info-box" style={{marginTop:18}}>
            <h4>Open on GitHub</h4>
            <a className="btn" href={repo.html_url} target="_blank" rel="noreferrer" style={{display:'inline-block'}}>Open Repository</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Loading(){
  return (
    <div className="skeleton-row">
      <div className="skeleton-card"></div>
      <div className="skeleton-card"></div>
      <div className="skeleton-card"></div>
    </div>
  );
}

function App(){
  const [username, setUsername] = useState('musfiqsama');
  const [compareUsername, setCompareUsername] = useState('');
  const [mode, setMode] = useState('normal');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [compareAnalysis, setCompareAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [repoQuery, setRepoQuery] = useState('');
  const [langFilter, setLangFilter] = useState('all');
  const [selectedRepo, setSelectedRepo] = useState(null);

  useEffect(() => {
    handleAnalyze('musfiqsama');
  }, []);

  async function fetchBundle(name){
    const user = await fetchJson(`https://api.github.com/users/${name}`);
    const repos = await fetchJson(`https://api.github.com/users/${name}/repos?per_page=100&sort=updated`);
    const readmeA = await fetchText(`https://raw.githubusercontent.com/${name}/${name}/main/README.md`);
    const readmeB = readmeA || await fetchText(`https://raw.githubusercontent.com/${name}/${name}/master/README.md`);
    return buildAnalysis(user, repos, readmeB);
  }

  async function handleAnalyze(initialName){
    const mainName = (initialName || username).trim();
    if(!mainName) return;
    try{
      setError('');
      setLoading(true);
      const primary = await fetchBundle(mainName);
      setAnalysis(primary);
      if(compareUsername.trim()){
        const secondary = await fetchBundle(compareUsername.trim());
        setCompareAnalysis(secondary);
      } else {
        setCompareAnalysis(null);
      }
    } catch(e){
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const filteredRepos = useMemo(() => {
    if(!analysis) return [];
    return analysis.topRepos.filter((r) => {
      const matchesQuery = !repoQuery || r.name.toLowerCase().includes(repoQuery.toLowerCase()) || (r.description || '').toLowerCase().includes(repoQuery.toLowerCase());
      const matchesLang = langFilter === 'all' || r.language === langFilter;
      return matchesQuery && matchesLang;
    });
  }, [analysis, repoQuery, langFilter]);

  const allLanguages = useMemo(() => analysis ? [...new Set(analysis.topRepos.map((r) => r.language).filter(Boolean))] : [], [analysis]);

  const winners = useMemo(() => {
    if(!analysis || !compareAnalysis) return [];
    const list = [];
    if(analysis.total > compareAnalysis.total) list.push(`${analysis.user.login} leads in overall portfolio score`);
    else if(compareAnalysis.total > analysis.total) list.push(`${compareAnalysis.user.login} leads in overall portfolio score`);

    if(analysis.totalStars > compareAnalysis.totalStars) list.push(`${analysis.user.login} shows stronger popularity signals`);
    else if(compareAnalysis.totalStars > analysis.totalStars) list.push(`${compareAnalysis.user.login} shows stronger popularity signals`);

    if(analysis.subs.docsScore > compareAnalysis.subs.docsScore) list.push(`${analysis.user.login} looks better documented`);
    else if(compareAnalysis.subs.docsScore > analysis.subs.docsScore) list.push(`${compareAnalysis.user.login} looks better documented`);

    return list;
  }, [analysis, compareAnalysis]);

  return (
    <div className="app">
      <div className="topbar fade">
        <div className="brand">
          <div className="logo"><LogoSvg /></div>
          <div>
            <h1>GitScope</h1>
            <p>GitHub portfolio analyzer with recruiter-first insights</p>
          </div>
        </div>

        <div className="toolbar">
          <div className="view-toggle">
            <button className={mode === 'normal' ? 'active' : ''} onClick={() => setMode('normal')}>Normal View</button>
            <button className={mode === 'recruiter' ? 'active' : ''} onClick={() => setMode('recruiter')}>Recruiter View</button>
          </div>
          <button className="btn-secondary" onClick={() => window.print()}>Export Report</button>
        </div>
      </div>

      <section className="hero fade">
        <h2>Analyze any GitHub profile</h2>
        <p>Compare two developers, inspect repo health, preview profile README, and get a cleaner recruiter-style summary without paid APIs.</p>

        <div className="controls">
          <div className="input-wrap">
            <span>⌕</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter GitHub username" />
          </div>

          <div className="input-wrap">
            <span>⇄</span>
            <input value={compareUsername} onChange={(e) => setCompareUsername(e.target.value)} placeholder="Compare username (optional)" />
          </div>

          <button className="btn" onClick={() => handleAnalyze()}>Analyze Profile</button>
          <button className="btn-secondary" onClick={() => setCompareUsername(compareUsername ? '' : 'torvalds')}>{compareUsername ? 'Single View' : 'Compare Mode'}</button>
        </div>

        <div className="examples">
          {['torvalds','gaearon','vercel','kentcdodds'].map((name) => (
            <button key={name} className="chip" onClick={() => { setUsername(name); handleAnalyze(name); }}>{name}</button>
          ))}
        </div>
      </section>

      {error && <div className="card fade"><div className="card-inner" style={{color:'#ffb7c6'}}>{error}</div></div>}

      {loading && <Loading />}

      {!loading && analysis && (
        <>
          {compareAnalysis ? (
            <div className="grid-2">
              {[analysis, compareAnalysis].map((item) => (
                <div className="card fade" key={item.user.login}>
                  <div className="card-inner">
                    <div className="profile-top">
                      <img className="avatar" src={item.user.avatar_url} alt={item.user.login} />
                      <div>
                        <div className="profile-name">{item.user.name || item.user.login}</div>
                        <div className="handle">@{item.user.login}</div>
                        <p className="bio">{item.user.bio || 'No bio added yet.'}</p>
                      </div>
                    </div>

                    <div className="stats">
                      <div className="stat"><div className="stat-label">Public Repositories</div><div className="stat-value">{item.user.public_repos}</div></div>
                      <div className="stat"><div className="stat-label">Followers</div><div className="stat-value">{fmt.format(item.user.followers)}</div></div>
                      <div className="stat"><div className="stat-label">Account Age</div><div className="stat-value">{yearsSince(item.user.created_at)}</div></div>
                      <div className="stat"><div className="stat-label">Portfolio Score</div><div className="stat-value">{item.total}</div></div>
                    </div>

                    <div className="info-box" style={{marginTop:16}}>
                      <h4>Recruiter View</h4>
                      <ul>
                        {item.strengths.slice(0,2).map((x,i) => <li key={i}>{x}</li>)}
                        {item.weaknesses.slice(0,1).map((x,i) => <li key={`w${i}`}>{x}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid-3">
              <div className="card fade">
                <div className="card-inner">
                  <div className="eyebrow">Profile Summary</div>

                  <div className="profile-top">
                    <img className="avatar" src={analysis.user.avatar_url} alt={analysis.user.login} />
                    <div>
                      <div className="profile-name">{analysis.user.name || analysis.user.login}</div>
                      <div className="handle">@{analysis.user.login}</div>
                      <p className="bio">{analysis.user.bio || 'No bio added yet.'}</p>
                    </div>
                  </div>

                  <div className="stats">
                    <div className="stat"><div className="stat-label">Company / Org</div><div className="stat-value small">{analysis.user.company || 'Independent'}</div></div>
                    <div className="stat"><div className="stat-label">Account Created</div><div className="stat-value small">{new Date(analysis.user.created_at).toLocaleDateString()}</div></div>
                    <div className="stat"><div className="stat-label">Public Repositories</div><div className="stat-value">{analysis.user.public_repos}</div></div>
                    <div className="stat"><div className="stat-label">Followers</div><div className="stat-value">{fmt.format(analysis.user.followers)}</div></div>
                    <div className="stat"><div className="stat-label">Total Stars</div><div className="stat-value">{analysis.totalStars}</div></div>
                    <div className="stat"><div className="stat-label">Account Age</div><div className="stat-value">{yearsSince(analysis.user.created_at)}</div></div>
                  </div>
                </div>
              </div>

              <div className="card fade">
                <div className="card-inner">
                  <div className="eyebrow">Portfolio Score</div>

                  <div className="score-wrap">
                    <ScoreRing score={analysis.total} label={analysis.label} />
                  </div>

                  <div className="score-grid">
                    <div className="score-box"><strong>{analysis.subs.profileScore}/20</strong><span>Profile</span></div>
                    <div className="score-box"><strong>{analysis.subs.repoQuality}/25</strong><span>Repo Quality</span></div>
                    <div className="score-box"><strong>{analysis.subs.docsScore}/20</strong><span>Docs</span></div>
                    <div className="score-box"><strong>{analysis.subs.activityScore}/15</strong><span>Activity</span></div>
                    <div className="score-box"><strong>{analysis.subs.signalsScore}/10</strong><span>Signals</span></div>
                    <div className="score-box"><strong>{analysis.subs.stackScore}/10</strong><span>Stack Clarity</span></div>
                  </div>
                </div>
              </div>

              <div className="card fade">
                <div className="card-inner">
                  <div className="eyebrow">Recruiter Impression</div>
                  <p className="recruiter-copy">{analysis.recruiterSummary}</p>

                  <div className="info-grid">
                    <div className="info-box">
                      <h4>Strengths</h4>
                      <ul>{analysis.strengths.map((x,i) => <li key={i}>{x}</li>)}</ul>
                    </div>

                    <div className="info-box">
                      <h4>Weaknesses</h4>
                      <ul>{analysis.weaknesses.map((x,i) => <li key={i}>{x}</li>)}</ul>
                    </div>

                    <div className="info-box">
                      <h4>Best Fit</h4>
                      <ul>{analysis.fit.map((x,i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  </div>

                  <div className="skill-row">
                    {analysis.skills.map((x,i) => <span className="skill-pill" key={i}>{x}</span>)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {compareAnalysis && winners.length > 0 && (
            <div className="card fade" style={{marginTop:20}}>
              <div className="card-inner">
                <div className="eyebrow">Compare Winners</div>
                <div className="winner-row">
                  {winners.map((w,i) => <span className="winner-pill" key={i}>{w}</span>)}
                </div>
              </div>
            </div>
          )}

          <div className="grid-2">
            <ChartCard
              eyebrow="Language Usage"
              title="Public stack composition"
              deps={[analysis ? JSON.stringify(analysis.languages) : '']}
              buildChart={(ctx) => new Chart(ctx, {
                type:'doughnut',
                data:{
                  labels:analysis.languages.map(([k]) => k),
                  datasets:[{
                    data:analysis.languages.map(([,v]) => v),
                    backgroundColor:['#7d8dff','#5de4c7','#f8c25c','#b38cff','#4db9ff','#7f8ab5'],
                    borderWidth:0
                  }]
                },
                options:{
                  responsive:true,
                  maintainAspectRatio:false,
                  plugins:{ legend:{ position:'right', labels:{ color:'#dce4ff', usePointStyle:true, pointStyle:'circle' } } }
                }
              })}
            />

            <ChartCard
              eyebrow="Activity Trend"
              title="Recent repository update rhythm"
              deps={[analysis ? JSON.stringify(analysis.activity) : '']}
              buildChart={(ctx) => new Chart(ctx, {
                type:'line',
                data:{
                  labels:analysis.activity.map((x) => x.label),
                  datasets:[{
                    label:'Updates',
                    data:analysis.activity.map((x) => x.value),
                    borderColor:'#5de4c7',
                    backgroundColor:'rgba(93,228,199,.12)',
                    fill:true,
                    tension:.35,
                    pointRadius:3
                  }]
                },
                options:{
                  responsive:true,
                  maintainAspectRatio:false,
                  plugins:{ legend:{ display:false } },
                  scales:{
                    x:{ ticks:{ color:'#8fa0c8' }, grid:{ color:'rgba(125,141,255,.08)' } },
                    y:{ ticks:{ color:'#8fa0c8', precision:0 }, grid:{ color:'rgba(125,141,255,.08)' } }
                  }
                }
              })}
            />
          </div>

          <div className="grid-2">
            <div className="card fade">
              <div className="card-inner">
                <div className="eyebrow">Contribution Heatmap</div>
                <h3 style={{marginTop:12}}>Recent momentum snapshot</h3>
                <div className="heatmap">
                  {analysis.heat.map((v,i) => <div key={i} className={`heat-cell ${v ? `l${v}` : ''}`}></div>)}
                </div>
              </div>
            </div>

            <div className="card fade">
              <div className="card-inner">
                <div className="eyebrow">Profile README</div>
                <h3 style={{marginTop:12}}>First-impression preview</h3>

                {analysis.readmeText ? (
                  <div className="readme" dangerouslySetInnerHTML={{ __html: marked.parse(analysis.readmeText.slice(0, 6000)) }} />
                ) : (
                  <div className="empty">No profile README found for this user.</div>
                )}
              </div>
            </div>
          </div>

          <div className="card fade" style={{marginTop:20}}>
            <div className="card-inner">
              <div className="eyebrow">Top Repositories</div>
              <h3 style={{marginTop:12}}>Repo health and showcase picks</h3>

              <div className="filter-bar">
                <input placeholder="Search repos" value={repoQuery} onChange={(e) => setRepoQuery(e.target.value)} />
                <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)}>
                  <option value="all">All languages</option>
                  {allLanguages.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>

              <div className="repo-list">
                {filteredRepos.map((repo) => (
                  <div className="repo-item" key={repo.id}>
                    <div>
                      <h4>{repo.name}</h4>
                      <p>{repo.description || 'No description added yet.'}</p>
                      <div className="repo-meta">
                        <span>{repo.language || 'Unknown'}</span>
                        <span>⭐ {repo.stargazers_count}</span>
                        <span>🍴 {repo.forks_count}</span>
                        <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="repo-right">
                      <span className={`health-pill ${repo.health >= 70 ? 'health-high' : repo.health >= 45 ? 'health-mid' : 'health-low'}`}>Health {repo.health}</span>
                      <button className="repo-btn" onClick={() => setSelectedRepo(repo)}>Details</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card fade">
              <div className="card-inner">
                <div className="eyebrow">Suggestions</div>
                <div className="repo-list" style={{marginTop:14}}>
                  {analysis.suggestions.map((s,i) => (
                    <div className="repo-item" key={i}>
                      <div>
                        <h4>Action {i + 1}</h4>
                        <p>{s}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {mode === 'recruiter' && (
              <div className="card fade">
                <div className="card-inner">
                  <div className="eyebrow">Recruiter Mode</div>

                  <div className="info-box" style={{marginTop:14}}>
                    <h4>10-second summary</h4>
                    <ul>
                      <li>{analysis.recruiterSummary}</li>
                      <li>Best suited for: {analysis.fit[0]}</li>
                      <li>Hiring confidence: {analysis.total >= 75 ? 'Strong junior candidate' : analysis.total >= 50 ? 'Promising candidate' : 'Needs polish before strong shortlist'}</li>
                    </ul>
                  </div>

                  <div className="info-box" style={{marginTop:14}}>
                    <h4>Interview talking points</h4>
                    <ul>
                      <li>Ask about the top showcased repository.</li>
                      <li>Discuss documentation decisions and README depth.</li>
                      <li>Explore consistency of recent public work.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="footer">Made by Musfiqur Rahman Sama</div>
        </>
      )}

      <RepoModal repo={selectedRepo} onClose={() => setSelectedRepo(null)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
