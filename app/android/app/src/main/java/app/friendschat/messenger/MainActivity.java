package app.friendschat.messenger;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	private static final int MEDIA_PERMISSION_REQUEST = 1001;

	@Override
	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
				|| checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
			requestPermissions(
					new String[] { Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO },
					MEDIA_PERMISSION_REQUEST);
		}
		getBridge().getWebView().setWebChromeClient(new WebChromeClient() {
			@Override
			public void onPermissionRequest(final PermissionRequest request) {
				runOnUiThread(() -> request.grant(request.getResources()));
			}
		});
	}
}
