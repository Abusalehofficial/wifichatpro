<?php
requireAdmin();
if($_SERVER['REQUEST_METHOD']==='POST' && validateCSRFToken($_POST['csrf_token']??'')){
  $sets=$_POST['settings']??[];
  foreach($sets as $k=>$v){
    $k=preg_replace('/[^a-z0-9_]/','',$k);
    if(!$k)continue;
    $stmt=$pdo->prepare("INSERT INTO site_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=?");
    $stmt->execute([$k,$v,$v]);
  }
  // QR upload
  if(!empty($_FILES['payment_qr']['name'])){
    $up=uploadFile($_FILES['payment_qr'],'uploads',['jpg','jpeg','png']);
    if($up['success']){
      $pdo->prepare("INSERT INTO site_settings(setting_key,setting_value) VALUES('payment_qr_image',?) ON DUPLICATE KEY UPDATE setting_value=?")
          ->execute(['uploads/'.$up['filename'],'uploads/'.$up['filename']]);
    }
  }
  setFlash('success','Settings saved');
  adminRedirect('?page=settings');
}
$stmt=$pdo->query("SELECT * FROM site_settings"); $settings=[];
while($r=$stmt->fetch())$settings[$r['setting_key']]=$r['setting_value'];
?>
<div class="space-y-6">
  <h2 class="text-2xl font-bold text-gray-800">Site Settings</h2>
  <form method="POST" enctype="multipart/form-data" class="space-y-6">
    <input type="hidden" name="csrf_token" value="<?=e(generateCSRFToken())?>">

    <!-- General -->
    <div class="bg-white rounded-xl shadow p-6"><h3 class="font-semibold mb-4">General</h3>
      <div class="grid md:grid-cols-2 gap-4">
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Office Address</label><textarea name="settings[office_address]" class="form-control" rows="2"><?=e($settings['office_address']??'')?></textarea></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Contact Email</label><input type="email" name="settings[contact_email]" value="<?=e($settings['contact_email']??'')?>" class="form-control"></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label><input type="text" name="settings[contact_phone]" value="<?=e($settings['contact_phone']??'')?>" class="form-control"></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label><input type="text" name="settings[whatsapp_number]" value="<?=e($settings['whatsapp_number']??'')?>" class="form-control"></div>
      </div>
    </div>

    <!-- Membership -->
    <div class="bg-white rounded-xl shadow p-6"><h3 class="font-semibold mb-4">Membership</h3>
      <div class="grid md:grid-cols-2 gap-4">
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Basic Price (₹)</label><input type="number" name="settings[basic_membership_price]" value="<?=e($settings['basic_membership_price']??1000)?>" class="form-control"></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Premium Price (₹)</label><input type="number" name="settings[premium_membership_price]" value="<?=e($settings['premium_membership_price']??2000)?>" class="form-control"></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Duration (Months)</label><input type="number" name="settings[membership_duration]" value="<?=e($settings['membership_duration']??12)?>" class="form-control"></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Renewal Reminder (days)</label><input type="number" name="settings[renewal_reminder_days]" value="<?=e($settings['renewal_reminder_days']??30)?>" class="form-control"></div>
      </div>
    </div>

    <!-- Payment -->
    <div class="bg-white rounded-xl shadow p-6"><h3 class="font-semibold mb-4">Payment</h3>
      <div class="grid md:grid-cols-2 gap-4">
        <div><label class="block text-sm font-medium text-gray-700 mb-1">UPI ID</label><input type="text" name="settings[upi_id]" value="<?=e($settings['upi_id']??'')?>" class="form-control" placeholder="example@paytm"></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Bank Account</label><input type="text" name="settings[bank_account]" value="<?=e($settings['bank_account']??'')?>" class="form-control"></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Bank Name</label><input type="text" name="settings[bank_name]" value="<?=e($settings['bank_name']??'')?>" class="form-control"></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">IFSC</label><input type="text" name="settings[ifsc_code]" value="<?=e($settings['ifsc_code']??'')?>" class="form-control"></div>
      </div>
      <div class="mt-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">Payment QR Code</label>
        <?php if(!empty($settings['payment_qr_image'])): ?><img src="/<?=e($settings['payment_qr_image'])?>" class="h-40 rounded border mb-2"><?php endif; ?>
        <input type="file" name="payment_qr" class="form-control" accept="image/*">
      </div>
    </div>

    <!-- Social -->
    <div class="bg-white rounded-xl shadow p-6"><h3 class="font-semibold mb-4">Social Media</h3>
      <div class="grid md:grid-cols-2 gap-4">
        <?php foreach(['facebook','twitter','instagram','linkedin','youtube'] as $s): ?>
        <div><label class="block text-sm font-medium text-gray-700 mb-1"><?=ucfirst($s)?> URL</label><input type="url" name="settings[<?=$s?>_url]" value="<?=e($settings[$s.'_url']??'')?>" class="form-control" placeholder="https://<?=$s?>.com/username"></div>
        <?php endforeach; ?>
      </div>
    </div>

    <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"><i class="fa fa-save mr-2"></i>Save All Settings</button>
  </form>
</div>