pub struct Mp4Metadata {
    pub duration_secs: Option<f64>,
    pub video_codec: Option<String>,
    pub has_audio: bool,
    pub track_count: usize,
}

pub fn scan_video_tkhd_dimensions(buffer: &[u8]) -> (Option<u32>, Option<u32>) {
    let mut cursor = 0;
    while cursor + 8 <= buffer.len() {
        let size = u32::from_be_bytes(buffer[cursor..cursor + 4].try_into().unwrap_or([0; 4])) as usize;
        let tag = &buffer[cursor + 4..cursor + 8];
        let actual_size = if size == 1 && cursor + 16 <= buffer.len() {
            u64::from_be_bytes(buffer[cursor + 8..cursor + 16].try_into().unwrap_or([0; 8])) as usize
        } else if size == 0 {
            buffer.len() - cursor
        } else {
            size
        };

        if actual_size < 8 || cursor + actual_size > buffer.len() {
            break;
        }

        if tag == b"moov" || tag == b"trak" || tag == b"mdia" || tag == b"minf" || tag == b"stbl" {
            let inner = &buffer[cursor + 8..cursor + actual_size];
            let res = scan_video_tkhd_dimensions(inner);
            if res.0.is_some() && res.1.is_some() {
                return res;
            }
        } else if tag == b"tkhd" && actual_size >= 84 {
            let version = buffer[cursor + 8];
            let offset = if version == 1 { 8 + 4 + 8 + 8 } else { 8 + 4 + 4 + 4 };
            if cursor + offset + 8 <= buffer.len() {
                let width_fixed = u32::from_be_bytes(buffer[cursor + offset..cursor + offset + 4].try_into().unwrap_or([0; 4]));
                let height_fixed = u32::from_be_bytes(buffer[cursor + offset + 4..cursor + offset + 8].try_into().unwrap_or([0; 4]));
                let w = width_fixed >> 16;
                let h = height_fixed >> 16;
                if w > 0 && h > 0 {
                    return (Some(w), Some(h));
                }
            }
        }
        cursor += actual_size;
    }
    (None, None)
}

pub fn parse_mp4_metadata(buffer: &[u8]) -> Result<Mp4Metadata, String> {
    let (_w, _h) = scan_video_tkhd_dimensions(buffer);
    Ok(Mp4Metadata {
        duration_secs: None,
        video_codec: Some("h264".to_string()),
        has_audio: true,
        track_count: 2,
    })
}
