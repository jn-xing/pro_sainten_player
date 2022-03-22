async function LoadOggBuffer(inputArrayBuffer,audioContext) {
  const outputSampleRate = audioContext.sampleRate;
  let sample_rate = 0;
  let channel_count = 0;
  let rawbuffer = null;
  let sample_size = 0;
  let decode_fin = false;

  stbvorbis.decode(inputArrayBuffer,function (e) {
    if(e.eof){
      console.log("decode finish.");
      decode_fin = true;
      return;
    }
    //初回のデコードでサンプリングレートとチャンネル数を判断
    if(sample_size === 0){
      sample_rate = e.sampleRate;
      channel_count = e.data.length;
      rawbuffer = [channel_count];
      for (let i = 0; i < channel_count; i++) {
        rawbuffer[i] = new Float32Array(0);
      }
    }    
    //新しいデコード済みデータをためる
    sample_size += e.data[0].length;
    for (let i = 0; i < channel_count; i++) {
      const newbuffer = new Float32Array(sample_size);
      newbuffer.set(rawbuffer[i],0);
      newbuffer.set(e.data[i],rawbuffer[i].length);
      rawbuffer[i] = newbuffer;
    }
    return;
  });

  const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  while(!decode_fin){
    await _sleep(100);
  }
  
  //デコード済みデータ連結
  let aud_buffer = audioContext.createBuffer(channel_count, sample_size, sample_rate);
  
  for (let i = 0; i < channel_count; i++) {
    aud_buffer.getChannelData(i).set(rawbuffer[i]);
  }
  //リサンプル
  if(sample_rate !== outputSampleRate){
    console.log("resample");
    let resample_fin = false;
    resample(aud_buffer, outputSampleRate,(resampled)=>{
      aud_buffer = resampled.renderedBuffer;
      resample_fin = true;
    });
    while(!resample_fin){
      await _sleep(100);
    }
  }

  return aud_buffer;
}

function resample(inputBuffer, outSampleRate, callback) {
  const _OfflineAudioContext = new OfflineAudioContext(inputBuffer.numberOfChannels, inputBuffer.duration * inputBuffer.numberOfChannels * outSampleRate, outSampleRate);
  const _AudioBuffer = _OfflineAudioContext.createBuffer(inputBuffer.numberOfChannels, inputBuffer.length, inputBuffer.sampleRate);
  for (let channel = 0; channel < inputBuffer.numberOfChannels; channel++) {
      _AudioBuffer.copyToChannel(inputBuffer.getChannelData(channel), channel);
  }
  const _AudioBufferSourceNode = _OfflineAudioContext.createBufferSource();
  _AudioBufferSourceNode.buffer = _AudioBuffer;
  _AudioBufferSourceNode.connect(_OfflineAudioContext.destination);
  _AudioBufferSourceNode.start(0);
  _OfflineAudioContext.oncomplete = (_OfflineAudioCompletionEvent) => {
      callback(_OfflineAudioCompletionEvent)
  }
  _OfflineAudioContext.startRendering();
}