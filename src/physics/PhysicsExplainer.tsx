/** Cantonese explanations of shuttle impact, spin and aerodynamics, with how sure we are of each point. */

const OK = <span className="badge ok">✅ 研究證實</span>;
const MIXED = <span className="badge mixed">⚠️ 研究未有定論</span>;
const MODEL = <span className="badge model">🔬 模型推算</span>;

const SECTIONS: Array<{ title: string; body: React.ReactNode }> = [
  {
    title: '① 點解羽毛球永遠係球頭向前？',
    body: (
      <>
        <p>
          {OK} 球頭（軟木）重，<b>重心</b>靠近球頭；羽毛裙大塊，空氣推佢嘅<b>壓力中心</b>喺後面。
          阻力打喺重心後面，就好似箭尾羽毛咁產生<b>恢復力矩</b>，將球頭拉返去前面。
        </p>
        <p className="formula">恢復力矩 ∝ ½ρ·C·A·v² × (重心到壓力中心距離) × sin(傾角)</p>
        <p>力矩同 <b>v²</b> 成正比：球越快，擺正得越快；球越慢，就越易「冇主意」。</p>
      </>
    ),
  },
  {
    title: '② 擊球後翻轉：約 20 毫秒',
    body: (
      <p>
        {OK} 觸拍只有約 1 ms。之後個球要翻轉，令球頭向前，大約 20 ms 完成主要翻轉，再擺動多數十毫秒先穩定（Cohen 等 2015）。
        將播放調去 <b>1/50×</b>，睇特寫畫面就見到。本模型殺球翻轉約 15–25 ms。
      </p>
    ),
  },
  {
    title: '③ 來球方向唔同 → 回球表現唔同',
    body: (
      <>
        <p>
          {MODEL} 來球係球頭向前飛嘅，所以擊球一刻<b>球軸 = 來球方向</b>。出球要「翻」幾多度，取決於來球方向同出球方向嘅夾角：
        </p>
        <ul>
          <li><b>高球垂直跌落</b>（球頭向下）再殺返出去：只需翻約 90°。</li>
          <li><b>平抽來球</b>（球頭直指住你）再抽返原路：要翻足 180°。</li>
        </ul>
        <p>
          {MODEL} 同一個拍面，來球角度唔同，出球角度都唔同。例如平抽嘅拍面（垂直）去打一個垂直跌落嘅球，
          球嘅向下速度係「沿住拍面」，拍面推唔走，只靠摩擦減少少，所以個球會向下插去落網。
          睇右邊「同一下揮拍，唔同來球」嗰個表。所以打高球時要<b>開拍面、喺高點擊球</b>，唔可以用平抽嘅拍面。
        </p>
        <p>{MODEL} 迎住快來球（例如接殺、平抽），來球會反彈「借」力俾你；垂直跌落嘅高球速度得 6–7 m/s，幾乎冇力借，全部要靠自己揮拍。</p>
      </>
    ),
  },
  {
    title: '④ 球拍點樣決定出球：拍面 vs 揮拍方向',
    body: (
      <>
        <p>將拍對球嘅作用分成兩部分：</p>
        <ul>
          <li><b>垂直拍面方向（法向）</b>：好似反彈咁推走個球，決定出球主要方向同速度。</li>
          <li><b>沿住拍面方向（切向）</b>：拍線擦過球頭，產生<b>摩擦</b>。摩擦一方面改變少少方向，另一方面令球<b>自旋或者翻滾</b>。</li>
        </ul>
        <p>
          {OK} 職業殺球，球速大約係拍頭速度嘅 1.35–1.5 倍（有研究量到約 1.35 倍）。本模型垂直跌落球殺出去約 1.36 倍。
        </p>
        <p>
          {MODEL} <b>拍面朝向</b>決定個球去邊：關拍面（向下壓）→ 殺球；開拍面 → 高遠球、挑球。
          <b>揮拍方向同拍面朝向唔一致</b>（有夾角）就係「切」：夾角越大，擦得越多，轉得越勁，但出球速度會慢啲。
        </p>
        <p>
          {MODEL} <b>握拍鬆緊</b>：握得鬆，球拍嘅「有效質量」細，回彈就慢。所以擋網、接殺放網要放鬆握拍。
          （數值係假設：握緊約 35–45 g，握鬆約 12–20 g。）
        </p>
      </>
    ),
  },
  {
    title: '⑤ 自旋從何而來？',
    body: (
      <>
        <p>
          {OK} 鵝毛一片疊一片，形狀有「手性」（左右唔對稱），空氣流過就推住佢轉，所以自旋主要係<b>空氣自己造出嚟</b>。轉速隨飛行速度增加（Nakagawa 等）。
          每個鵝毛球嘅自然旋轉方向係固定嘅（Collet 2024）。
        </p>
        <p>{MODEL} 本模型用「每飛 1 米轉約 2.5 圈」做近似（膠球約 1 圈）。翻轉期間空氣倒流，所以啱啱出手時自然自旋好弱。</p>
      </>
    ),
  },
  {
    title: '⑥ 劈吊（切球）：左手同右手唔同！',
    body: (
      <>
        <p>
          {OK} 高速攝影（3700 fps）研究（Collet 2024）量到劈吊後個球轉速大約 <b>125–166 轉/秒</b>。
          <b>右手</b>正手劈吊嘅自旋同羽毛球嘅自然旋轉<b>同一個方向</b>，會加快佢。
          <b>左手</b>劈吊（或者右手反切）就相反：個球會先反方向轉，之後再被羽毛扭返轉頭。
        </p>
        <p>{OK} 劈吊之後有一段短時間嘅<b>馬格努斯（Magnus）升力</b>，左手劈吊嘅升力較弱；左手劈吊或者反切嘅球減速得更快（Collet 2026）。</p>
        <p>
          {MODEL} 本模型由摩擦計出嚟嘅劈吊自旋約 50–70 轉/秒，比實測細，即係仲有其他機制（例如球頭變形、羽毛受力）模型未包括。
          反向自旋令阻力大 15% 呢個數值係模型假設。
        </p>
      </>
    ),
  },
  {
    title: '⑦ 自旋會唔會令阻力增加？',
    body: (
      <p>
        {MIXED} 研究結論唔一致：Kitta 等量到自由旋轉時阻力係數大約高 8%；另一啲研究（包括電腦流體模擬）就發現低 4–8%，亦有研究話冇明顯分別。
        所以本模型預設<b>冇影響</b>，你可以喺「自旋對阻力影響」自己調，睇吓影響有幾大。
      </p>
    ),
  },
  {
    title: '⑧ 陀螺效應同側向漂移',
    body: (
      <p>
        {MODEL} 轉緊嘅物件有角動量，會抗拒軸心改變方向。喺高遠球弧頂，飛行方向轉得快，球軸跟唔切，而且陀螺效應令偏差打側，
        於是產生側向力，令球向一邊飄。原理同子彈嘅「旋轉漂移」一樣。暫時搵唔到羽毛球嘅實測數據，所以要當係模型預測，唔係定論。
        試吓勾「關閉陀螺效應」比較吓。
      </p>
    ),
  },
  {
    title: '⑨ 搓球點解會翻滾？',
    body: (
      <p>
        {OK} 翻滾網前同普通放網嘅分別，主要喺手腕同前臂嘅動作（ISB 2009 研究），即係拍面擦過球頭嘅方式唔同。
        {MODEL} 網前球速只有幾 m/s，恢復力矩 ∝ v² 好弱，所以球一被擦到打筋斗，空氣都拉唔返，個球就會一路翻。對手好易打中羽毛而唔係球頭。
      </p>
    ),
  },
  {
    title: '⑩ 終端速度同「空氣動力牆」',
    body: (
      <p>
        {OK} 實測終端速度約 <b>6.5–6.9 m/s</b>（本模型 6.8 m/s）。羽毛球阻力極大，打得再大力，距離都有上限（Cohen 等 2015）。
        {MODEL} 本模型入面，殺球出手 70 m/s，過網時只剩大約 18 m/s。高遠球初速加倍，落點只係遠咗大約 2 米。
      </p>
    ),
  },
  {
    title: '🧪 建議你試嘅實驗',
    body: (
      <ol>
        <li>揀「殺球」，來球轉做「平抽來球」再轉返「高球垂直跌落」：睇「球要翻轉」由 168° 變成 92°。</li>
        <li>揀「平抽」動作，來球揀「高球垂直跌落」：個球落網。呢個就係點解高球唔可以用平抽拍面打。</li>
        <li>揀「劈吊（右手）」同「左手劈吊」：睇自旋圖嘅方向相反。</li>
        <li>揀「擋網」，將握拍鬆緊由 20 g 拉到 40 g：個球會飛出界。</li>
        <li>喺「殺球」慢慢加大「揮拍方向：左右」：拍面同揮拍出現夾角，自旋增加，但速度減慢。</li>
      </ol>
    ),
  },
];

const SOURCES: Array<[string, string]> = [
  ['Cohen, Darbois Texier, Quéré, Clanet (2015) The physics of badminton, New J. Phys.', 'https://core.ac.uk/download/47088083.pdf'],
  ['Collet (2024) Left- vs right-handed badminton slice shots, Comptes Rendus Physique', 'https://comptes-rendus.academie-sciences.fr/physique/articles/10.5802/crphys.174'],
  ['Collet (2026) Shuttlecock velocity decay after smash and slice shots, arXiv', 'https://arxiv.org/abs/2601.01412'],
  ['Shuttlecock terminal velocity (J. Sports Sci. Med.)', 'https://jssm.org/jssm-08-657.xml-Fulltext'],
  ['Spin and drag of shuttlecocks (Proceedings 2020, MDPI)', 'https://www.mdpi.com/2504-3900/49/1/28'],
  ['Racket–shuttle speed ratio study (worldbadminton.com)', 'https://www.worldbadminton.com/reference/research/documents/Coefficient.pdf'],
  ['Nakagawa et al. (2012) shuttle rotation in flight', 'https://www.worldbadminton.com/reference/research/documents/0f3175375139a2ae3e000000.pdf'],
  ['Tumbling vs dab net shot kinematics (ISB 2009)', 'https://media.isbweb.org/images/conf/2009/data/pdf/544.pdf'],
];

export default function PhysicsExplainer() {
  return (
    <div className="card explainer">
      <h3>擊球、旋轉同空氣動力：一步步理解</h3>
      <p className="small">
        每點都有標記：{OK}{MIXED}{MODEL}
      </p>
      {SECTIONS.map((s, i) => (
        <details key={s.title} open={i === 2}>
          <summary>{s.title}</summary>
          {s.body}
        </details>
      ))}
      <details>
        <summary>📚 資料來源</summary>
        <ul className="sources">
          {SOURCES.map(([t, u]) => (
            <li key={u}>
              <a href={u} target="_blank" rel="noreferrer">{t}</a>
            </li>
          ))}
        </ul>
      </details>
      <p className="muted small">
        註：呢個係簡化嘅教學模型（剛體撞擊加六自由度飛行），係數取自上面研究嘅大約數，或者係合理假設（已經標明）。
        真實球會因品牌、羽毛、溫度、氣壓而唔同。用嚟理解「點解」，唔好當實驗室數據。
      </p>
    </div>
  );
}
