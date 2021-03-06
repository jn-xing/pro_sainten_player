/*
（今から実装）多分これでマルチチャンネルのリアルタイム個別ボリューム制御が行けるはず・・・ブラウザたちがちゃんとマルチチャンネル実装してれば。
===読み込み関数×2===
1.other読み込み（読み込み関数）
2.vocal読み込み（読み込み関数）
===4chMixBuffer作成関数===
3.other,vocalのうちの最大長を求める
4.最大長で4chのbuffer作成(createbufferで指定できる、サンプルレートはoggから取得したものを指定)
5.1/2chにvocal,3/4chにotherを書き込む（一括で書き込めないので1サンプルずつループで書きこむっぽい・・・）
===再生関数===
6.splitterを用意してvocal(bufferの1/2ch),other(bufferの3/4ch)それぞれをconnect
7.gainノードを4つ用意してsplitterの各chをそれぞれのgainノードにconnect
8.2chのmergerを用意してgainノード4つをconnect　0→L,1→R,2→L,3→R
9.bufferを再生
===イベントコントロール===
-再生
-一時停止
-シークバー（スライダーバー）ドラッグ時のシークと再生位置返し
-vocal,otherの個別音量スライダーバー（1/2chでステレオリンク、3/4chでステレオリンク）
===その他===
余力あれば　プログレスバーもしくはぐるぐる
*/

const OutputSampleRate = 48000;
let audioUrl_Other = "./audio/348378_other.ogg";
let audioUrl_Vocal = "./audio/348378_gv.ogg";

window.AudioContext = window.AudioContext || window.webkitAudioContext;
const AudioCtx = new AudioContext({sampleRate:OutputSampleRate});
//チャンネルスプリッター
const ChannelSplitterNode = AudioCtx.createChannelSplitter(4);
//4ch分のフェーダー
const VolumeFaderNode = [AudioCtx.createGain(),AudioCtx.createGain(),AudioCtx.createGain(),AudioCtx.createGain()];
//4ch分のディレイ
const DelayNode = [AudioCtx.createDelay(),AudioCtx.createDelay(),AudioCtx.createDelay(),AudioCtx.createDelay()];

//ディレイノードに渡す値（マイナスのオフセットができるようわざと最初に100ms遅らせるのを標準とする）
const DelayFirstOffset = 0.1;
function delayValue(delayTime){
  trueValue = DelayFirstOffset + delayTime;
  if(trueValue < 0){trueValue = 0;}
  return trueValue;
}

//出力マージャー
const StereoOutNode = AudioCtx.createChannelMerger(2);

let sampleSource;
// 再生中のときはtrue
let isPlaying = false;
//再生用バッファ
let PlayBuffer;

// 音源を取得しAudioBuffer形式に変換して返す関数
async function loadSample(audioUrl) {
  const response = await fetch(audioUrl);
  const arrayBuffer = await response.arrayBuffer();
  // Web Audio APIで使える形式に変換
  let audioBuffer;
  //oggの場合は専用のデコーダを使う（iOSがOggデコード出来ないため）
  if(audioUrl.split('.').pop().toLowerCase() === "ogg"){
    audioBuffer = await LoadOggBuffer(arrayBuffer,AudioCtx);
    console.log("ogg load.");
  }
  else{
    audioBuffer = await AudioCtx.decodeAudioData(arrayBuffer);
  }
  return audioBuffer;
}

//4chMixBufferが返る
async function getChMixBuffer(vocalBuf, otherBuf){
  //3.other,vocalのうちの最大長を求める
  let maxSampleLength = vocalBuf.length;
  if(maxSampleLength < otherBuf.length){
    maxSampleLength = otherBuf.length;
  }
  //4.最大長で4chのbuffer作成(createbufferで指定できる、サンプルレートはoggから取得したものを指定)
  
  let mixBuffer4ch = AudioCtx.createBuffer(4,maxSampleLength,AudioCtx.sampleRate);
  //let mixBuffer4ch = new AudioBuffer())
  //5.1/2chにvocal,3/4chにotherを書き込む（一括で書き込めないので1サンプルずつループで書きこむっぽい・・・）
  mixBuffer4ch.getChannelData(0).set(vocalBuf.getChannelData(0));
  mixBuffer4ch.getChannelData(1).set(vocalBuf.getChannelData(1));
  mixBuffer4ch.getChannelData(2).set(otherBuf.getChannelData(0));
  mixBuffer4ch.getChannelData(3).set(otherBuf.getChannelData(1));

  return mixBuffer4ch;
}

// AudioBufferをctxに接続し再生する関数
function playSample() {
  sampleSource = AudioCtx.createBufferSource();
  // 変換されたバッファーを音源として設定
  sampleSource.buffer = PlayBuffer;
  //Splitterにつなげる
  sampleSource.connect(ChannelSplitterNode);
  
  // gainにつなげる
  ChannelSplitterNode.connect(VolumeFaderNode[0],0);
  ChannelSplitterNode.connect(VolumeFaderNode[1],1);
  ChannelSplitterNode.connect(VolumeFaderNode[2],2);
  ChannelSplitterNode.connect(VolumeFaderNode[3],3);
  
  //Delayにつなげる
  VolumeFaderNode[0].connect(DelayNode[0],0);
  VolumeFaderNode[1].connect(DelayNode[1],0);
  VolumeFaderNode[2].connect(DelayNode[2],0);
  VolumeFaderNode[3].connect(DelayNode[3],0);
  
  //2mix
  DelayNode[0].connect(StereoOutNode,0,0);
  DelayNode[1].connect(StereoOutNode,0,1);
  DelayNode[2].connect(StereoOutNode,0,0);
  DelayNode[3].connect(StereoOutNode,0,1);

  // 出力につなげる
  StereoOutNode.connect(AudioCtx.destination);
  //sampleSource.connect(AudioCtx.destination);
  sampleSource.start(0);
  isPlaying = true;
}

//再生ボタン
document.querySelector("#play").addEventListener("click", async () => {
  // 再生中なら二重に再生されないようにする
  if (isPlaying) return;
  
  playSample();
});

//ロードボタン
//(iOS対応。awaitとか全く挟まずにPlayボタンのスレッド直で再生を開始しないといけないので、
//ロード工程を分ける必要がある)
//const LoadButton = document.querySelector("#load");
// LoadButton.addEventListener("click", async () => {
//   //1.other読み込み（読み込み関数）
//   const vocalBuffer = await loadSample(audioUrl_Vocal);
//   //2.vocal読み込み（読み込み関数）
//   const otherBuffer = await loadSample(audioUrl_Other);
//   //再生用4chバッファ作成
//   PlayBuffer = await getChMixBuffer(vocalBuffer,otherBuffer);
//   //テキスト変更
//   LoadButton.textContent = "loaded";
// });

//ロード処理
//(iOS対応。awaitとか全く挟まずにPlayボタンのスレッド直で再生を開始しないといけないので、
async function dataLoad(){
  //1.other読み込み（読み込み関数）
  const vocalBuffer = await loadSample(audioUrl_Vocal);
  //2.vocal読み込み（読み込み関数）
  const otherBuffer = await loadSample(audioUrl_Other);
  //再生用4chバッファ作成
  PlayBuffer = await getChMixBuffer(vocalBuffer,otherBuffer);
  //テキスト変更
  //LoadButton.textContent = "loaded";
  return;
}

// ストップボタンoscillatorを破棄し再生を停止する
document.querySelector("#stop").addEventListener("click", async () => {
  sampleSource?.stop();
  isPlaying = false;
});

//ボーカル音量調整
const VocalGainSliderBar = document.querySelector("#vocalgain");
setVocalGainBySliderValue();  //初期値反映
VocalGainSliderBar.addEventListener("change", async () => {
  setVocalGainBySliderValue();
});
function setVocalGainBySliderValue(){
  let vol = VocalGainSliderBar.value;
  VolumeFaderNode[0].gain.setValueAtTime(vol,AudioCtx.currentTime);
  VolumeFaderNode[1].gain.setValueAtTime(vol,AudioCtx.currentTime);
  document.querySelector("#vocal_gain_value").innerText = vol;
}

//オケ音量調整
const OtherGainSliderBar = document.querySelector("#othergain");
setOtherGainBySliderValue();  //初期値反映
OtherGainSliderBar.addEventListener("change", async () => {
  setOtherGainBySliderValue();
});
function setOtherGainBySliderValue(){
  let vol = OtherGainSliderBar.value;
  VolumeFaderNode[2].gain.setValueAtTime(vol,AudioCtx.currentTime);
  VolumeFaderNode[3].gain.setValueAtTime(vol,AudioCtx.currentTime);
  document.querySelector("#other_gain_value").innerText = vol;
}

//ボーカル再生オフセット
const VocalOffsetSliderBar = document.querySelector("#vocaloffset");
setVocalOffsetBySliderValue();  //初期値反映
VocalOffsetSliderBar.addEventListener("change", async () => {
  setVocalOffsetBySliderValue();
});
function setVocalOffsetBySliderValue(){
  let offsetms = VocalOffsetSliderBar.value;
  DelayNode[0].delayTime.value = delayValue(offsetms / 1000.0);
  DelayNode[1].delayTime.value = delayValue(offsetms / 1000.0);
  document.querySelector("#vocal_offset_value").innerText = offsetms + "ms";
}

//オケ再生オフセット
const OtherOffsetSliderBar = document.querySelector("#otheroffset");
setOtherOffsetBySliderValue();  //初期値反映
OtherOffsetSliderBar.addEventListener("change", async () => {
  setOtherOffsetBySliderValue();
});
function setOtherOffsetBySliderValue(){
  let offsetms = OtherOffsetSliderBar.value;
  DelayNode[2].delayTime.value = delayValue(offsetms / 1000.0);
  DelayNode[3].delayTime.value = delayValue(offsetms / 1000.0);
  document.querySelector("#other_offset_value").innerText = offsetms + "ms";
}

// ローディング画面制御
const loading = document.querySelector( '.loading' );
window.addEventListener( 'load', async () => {
  await dataLoad();
  loading.classList.add( 'hide' );
}, false );