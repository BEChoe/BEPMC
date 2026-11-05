# ========================================================
# BEPMC Safety Mobile App - ProGuard / R8 Production Rules
# ========================================================

# 1. Android Native & WebView 보존
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes JavascriptInterface

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# 2. Activity 및 시스템 컴포넌트 보존
-keep public class com.bepmc.safety.MainActivity {
    public *;
}

# 3. WebViewClient 및 WebChromeClient 콜백 보존
-keepclassmembers class * extends android.webkit.WebViewClient {
    public void *(android.webkit.WebView, java.lang.String);
    public void *(android.webkit.WebView, java.lang.String, android.graphics.Bitmap);
}

-keepclassmembers class * extends android.webkit.WebChromeClient {
    public void *(android.webkit.WebView, int);
}

# 4. Kotlin 런타임 및 메타데이터 최적화
-dontwarn kotlin.**
-keep class kotlin.** { *; }
-dontwarn androidx.**
-keep class androidx.** { *; }

# 5. 불필요한 로그 스트립 (릴리스 최적화)
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
}
