#[cfg(target_os = "android")]
pub fn start_foreground_service() {
    log::info!("JNI: start_foreground_service called using cached descriptors");
    let ctx_obj = ndk_context::android_context();
    if let Ok(vm) = unsafe { jni::JavaVM::from_raw(ctx_obj.vm().cast()) } {
        if let Ok(mut env) = vm.attach_current_thread() {
            let ctx = unsafe { jni::objects::JObject::from_raw(ctx_obj.context().cast()) };
            if let (Some(j_class), Some(method_id)) = (
                crate::jni_cache::get_upload_service_jclass(),
                crate::jni_cache::get_start_service_method(),
            ) {
                let method = unsafe { jni::objects::JMethodID::from_raw(method_id) };
                let call_res = unsafe {
                    env.call_static_method_unchecked(
                        &j_class,
                        method,
                        jni::signature::ReturnType::Primitive(jni::signature::Primitive::Void),
                        &[jni::objects::JValue::from(&ctx).as_jni()],
                    )
                };
                if let Err(e) = call_res {
                    log::error!("JNI: startService call failed: {}", e);
                    if env.exception_check().unwrap_or(false) {
                        let _ = env.exception_describe();
                        let _ = env.exception_clear();
                    }
                } else {
                    log::info!("JNI: successfully called UploadForegroundService.startService using cached method ID");
                }
            } else {
                log::error!("JNI: startService class or method ID not cached!");
            }
        }
    }
}

#[cfg(target_os = "android")]
pub fn stop_foreground_service() {
    log::info!("JNI: stop_foreground_service called using cached descriptors");
    let ctx_obj = ndk_context::android_context();
    if let Ok(vm) = unsafe { jni::JavaVM::from_raw(ctx_obj.vm().cast()) } {
        if let Ok(mut env) = vm.attach_current_thread() {
            let ctx = unsafe { jni::objects::JObject::from_raw(ctx_obj.context().cast()) };
            if let (Some(j_class), Some(method_id)) = (
                crate::jni_cache::get_upload_service_jclass(),
                crate::jni_cache::get_stop_service_method(),
            ) {
                let method = unsafe { jni::objects::JMethodID::from_raw(method_id) };
                let call_res = unsafe {
                    env.call_static_method_unchecked(
                        &j_class,
                        method,
                        jni::signature::ReturnType::Primitive(jni::signature::Primitive::Void),
                        &[jni::objects::JValue::from(&ctx).as_jni()],
                    )
                };
                if let Err(e) = call_res {
                    log::error!("JNI: stopService call failed: {}", e);
                    if env.exception_check().unwrap_or(false) {
                        let _ = env.exception_describe();
                        let _ = env.exception_clear();
                    }
                } else {
                    log::info!("JNI: successfully called UploadForegroundService.stopService using cached method ID");
                }
            } else {
                log::error!("JNI: stopService class or method ID not cached!");
            }
        }
    }
}

#[cfg(not(target_os = "android"))]
pub fn start_foreground_service() {
    // Desktop doesn't need this.
}

#[cfg(not(target_os = "android"))]
pub fn stop_foreground_service() {
    // Desktop doesn't need this.
}

#[tauri::command]
pub fn cmd_start_foreground_service() {
    #[cfg(target_os = "android")]
    start_foreground_service();
}

#[tauri::command]
pub fn cmd_stop_foreground_service() {
    #[cfg(target_os = "android")]
    stop_foreground_service();
}
