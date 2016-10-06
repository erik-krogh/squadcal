var session_id = Math.floor(0x80000000 * Math.random()).toString(36);
var new_squad = null;
var creating = {};
var needs_update_after_creation = {};

if (show === 'reset_password') {
  $('input#reset-new-password').focus();
} else {
  // No way to escape the reset password prompt
  $(window).click(function(event) {
    if ($(event.target).hasClass('modal-overlay')) {
      $('div.modal-overlay').hide();
    }
  });
  $('span.modal-close').click(function() {
    $('div.modal-overlay').hide();
  });
  $(document).keyup(function(e) {
    if (e.keyCode == 27) { // esc key
      $('div.modal-overlay').hide();
    }
  });
}

var original_values = {};
$('textarea').each(function(i, element) {
  original_values[element.id] = element.value;
});

$('textarea').each(function () {
  this.setAttribute('style', 'height: ' + (this.scrollHeight) + 'px');
});
$('table').on('input', 'textarea', function() {
  this.style.height = 'auto';
  this.style.height = (this.scrollHeight) + 'px';
});
function save_entry(textarea_element) {
  if (textarea_element.value.trim() === '') {
    return;
  }
  var id_parts = textarea_element.id.split("_");
  if (id_parts[1] === "-1") {
    if (creating[id_parts[0]]) {
      needs_update_after_creation[id_parts[0]] = true;
      return;
    } else {
      creating[id_parts[0]] = true;
    }
  }
  $.post(
    'save.php',
    {
      'text': textarea_element.value,
      'day': id_parts[0],
      'month': month,
      'year': year,
      'squad': squad,
      'prev_text': original_values[textarea_element.id],
      'session_id': session_id,
      'timestamp': Date.now(),
      'entry_id': id_parts[1],
    },
    function(data) {
      console.log(data);
      if (data.error === 'concurrent_modification') {
        $('div#concurrent-modification-modal-overlay').show();
      }
      if (id_parts[1] === "-1" && data.entry_id) {
        var needs_update = needs_update_after_creation[id_parts[0]];
        var textarea = $("textarea#" + textarea_element.id);
        if (needs_update && textarea.length === 0) {
          delete_entry(data.entry_id);
        } else {
          textarea_element.id = id_parts[0] + "_" + data.entry_id;
          textarea.closest('div.entry').find('a.delete-entry-button').after(
            "<a href='#' class='entry-history-button'>" +
            "  <span class='history'>≡</span>" +
            "  <span class='action-links-text'>History</span>" +
            "</a>"
          );
        }
        creating[id_parts[0]] = false;
        needs_update_after_creation[id_parts[0]] = false;
        if (needs_update && $("textarea#" + textarea_element.id).length !== 0) {
          save_entry(textarea_element);
        }
      }
    }
  );
}
$('table').on('input', 'textarea', function(event) {
  save_entry(event.target);
});
$('input#refresh-button').click(function() {
  window.location.href = this_url;
});

$('select#squad-nav').change(function(event) {
  new_squad = event.target.value;
  if (new_squad === "0") {
    if (email) {
      $('div#new-squad-modal-overlay').show();
      $('div#new-squad-modal input:visible')
        .filter(function() { return this.value === ""; })
        .first()
        .focus();
    } else {
      $('select#squad-nav').val(squad);
      $('div#login-to-create-squad-modal-overlay').show();
    }
  } else if (authorized_squads[new_squad] !== true) {
    var new_squad_name = $(event.target)
      .find("[value='"+new_squad+"']").text();
    $('div#squad-login-name > div.form-content').text(new_squad_name);
    $('div#squad-login-modal-overlay').show();
    $('div#squad-login-modal input:visible')
      .filter(function() { return this.value === ""; })
      .first()
      .focus();
  } else {
    window.location.href = month_url+"&squad="+new_squad;
  }
});
$('div#squad-login-modal span.modal-close').click(function() {
  $('select#squad-nav').val(squad);
  $('input#squad-password').val("");
  $('div#squad-login-modal span.modal-form-error').text("");
});
$(window).click(function(event) {
  if (event.target.id === 'squad-login-modal-overlay') {
    $('select#squad-nav').val(squad);
    $('input#squad-password').val("");
    $('div#squad-login-modal span.modal-form-error').text("");
  }
});
$(document).keyup(function(e) {
  if (e.keyCode == 27) { // esc key
    $('select#squad-nav').val(squad);
    $('input#squad-password').val("");
    $('div#squad-login-modal span.modal-form-error').text("");
  }
});
$('div#squad-login-modal form').submit(function(event) {
  event.preventDefault();
  $('div#squad-login-modal input').prop("disabled", true);
  $.post(
    'auth_squad.php',
    {
      'squad': new_squad,
      'password': $('input#squad-password').val(),
    },
    function(data) {
      console.log(data);
      if (data.success === true) {
        window.location.href = month_url+"&squad="+new_squad;
        return;
      }
      $('input#squad-password').val("");
      $('input#squad-password').focus();
      $('div#squad-login-modal input').prop("disabled", false);
      if (data.error === 'invalid_credentials') {
        $('div#squad-login-modal span.modal-form-error')
          .text("wrong password");
      } else {
        $('div#squad-login-modal span.modal-form-error')
          .text("unknown error");
      }
    }
  );
});

$('input#new-squad-closed').click(function() {
  $('div#new-squad-password-container').show();
  $('div#new-squad-confirm-password-container').show();
});
$('input#new-squad-open').click(function() {
  $('div#new-squad-password-container').hide();
  $('div#new-squad-confirm-password-container').hide();
});
$('div#new-squad-modal span.modal-close').click(function() {
  $('select#squad-nav').val(squad);
  $('input#new-squad-password').val("");
  $('input#new-squad-confirm-password').val("");
  $('div#new-squad-modal span.modal-form-error').text("");
});
$(window).click(function(event) {
  if (event.target.id === 'new-squad-modal-overlay') {
    $('select#squad-nav').val(squad);
    $('input#new-squad-password').val("");
    $('input#new-squad-confirm-password').val("");
    $('div#new-squad-modal span.modal-form-error').text("");
  }
});
$(document).keyup(function(e) {
  if (e.keyCode == 27) { // esc key
    $('select#squad-nav').val(squad);
    $('input#new-squad-password').val("");
    $('input#new-squad-confirm-password').val("");
    $('div#new-squad-modal span.modal-form-error').text("");
  }
});
$('div#new-squad-modal form').submit(function(event) {
  event.preventDefault();
  var name = $('input#new-squad-name').val().trim();
  if (name === '') {
    $('input#new-squad-name').val("");
    $('input#new-squad-name').focus();
    $('div#new-squad-modal span.modal-form-error')
      .text("empty squad name");
    return;
  }
  var type = $('div#new-squad-modal input[name="new-squad-type"]:checked');
  if (type.length === 0) {
    $('input#new-squad-open').focus();
    $('div#new-squad-modal span.modal-form-error')
      .text("squad type unspecified");
    return;
  }
  var password = $('input#new-squad-password').val();
  if (type.val() === 'closed') {
    if (password.trim() === '') {
      $('input#new-squad-password').val("");
      $('input#new-squad-confirm-password').val("");
      $('input#new-squad-password').focus();
      $('div#new-squad-modal span.modal-form-error')
        .text("empty password");
      return;
    }
    var confirm_password = $('input#new-squad-confirm-password').val();
    if (password !== confirm_password) {
      $('input#new-squad-password').val("");
      $('input#new-squad-confirm-password').val("");
      $('input#new-squad-password').focus();
      $('div#new-squad-modal span.modal-form-error')
        .text("passwords don't match");
      return;
    }
  }
  $('div#new-squad-modal input').prop("disabled", true);
  $.post(
    'new_squad.php',
    {
      'name': name,
      'type': type.val(),
      'password': password,
    },
    function(data) {
      console.log(data);
      if (data.success === true) {
        window.location.href = month_url+"&squad="+data.new_squad_id;
        return;
      }
      $('div#new-squad-modal input').prop("disabled", false);
      $('input#new-squad-name').val("");
      $('input#new-squad-name').focus();
      if (data.error === 'name_taken') {
        $('div#new-squad-modal span.modal-form-error')
          .text("squad name already taken");
      } else {
        $('input#new-squad-password').val("");
        $('input#new-squad-confirm-password').val("");
        $('div#new-squad-modal input[name="new-squad-type"]')
          .prop('checked', false);
        $('div.new-squad-password').hide();
        $('div#new-squad-modal span.modal-form-error')
          .text("unknown error");
      }
    }
  );
});


$('a#log-in-button').click(function() {
  $('div#log-in-modal-overlay').show();
  $('div#log-in-modal input:visible')
    .filter(function() { return this.value === ""; })
    .first()
    .focus();
});
$('div#log-in-modal span.modal-close').click(function() {
  $('input#log-in-password').val("");
  $('div#log-in-modal span.modal-form-error').text("");
});
$(window).click(function(event) {
  if (event.target.id === 'log-in-modal-overlay') {
    $('input#log-in-password').val("");
    $('div#log-in-modal span.modal-form-error').text("");
  }
});
$(document).keyup(function(e) {
  if (e.keyCode == 27) { // esc key
    $('input#log-in-password').val("");
    $('div#log-in-modal span.modal-form-error').text("");
  }
});
$('div#log-in-modal form').submit(function(event) {
  event.preventDefault();
  var username = $('input#log-in-username').val();
  var valid_username_regex = /^[a-zA-Z0-9-_]+$/;
  var valid_email_regex = new RegExp(
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+/.source +
    /@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?/.source +
    /(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.source
  );
  if (
    username.search(valid_username_regex) === -1 &&
    username.search(valid_email_regex) === -1
  ) {
    $('input#log-in-username').val("");
    $('input#log-in-username').focus();
    $('div#log-in-modal span.modal-form-error')
      .text("alphanumeric usernames or emails only");
    return;
  }
  $('div#log-in-modal input').prop("disabled", true);
  $.post(
    'login.php',
    {
      'username': username,
      'password': $('input#log-in-password').val(),
    },
    function(data) {
      console.log(data);
      if (data.success === true) {
        window.location.href = this_url;
        return;
      }
      $('div#log-in-modal input').prop("disabled", false);
      if (data.error === 'invalid_parameters') {
        $('input#log-in-username').val("");
        $('input#log-in-username').focus();
        $('div#log-in-modal span.modal-form-error')
          .text("user doesn't exist");
      } else if (data.error === 'invalid_credentials') {
        $('input#log-in-password').val("");
        $('input#log-in-password').focus();
        $('div#log-in-modal span.modal-form-error')
          .text("wrong password");
      } else {
        $('input#log-in-username').val("");
        $('input#log-in-password').val("");
        $('input#log-in-username').val("");
        $('input#log-in-username').focus();
        $('div#log-in-modal span.modal-form-error')
          .text("unknown error");
      }
    }
  );
});

$('a#register-button').click(function() {
  $('div#register-modal-overlay').show();
  $('div#register-modal input:visible')
    .filter(function() { return this.value === ""; })
    .first()
    .focus();
});
$('div#register-modal span.modal-close').click(function() {
  $('input#register-password').val("");
  $('input#register-confirm-password').val("");
  $('div#register-modal span.modal-form-error').text("");
});
$(window).click(function(event) {
  if (event.target.id === 'register-modal-overlay') {
    $('input#register-password').val("");
    $('input#register-confirm-password').val("");
    $('div#register-modal span.modal-form-error').text("");
  }
});
$(document).keyup(function(e) {
  if (e.keyCode == 27) { // esc key
    $('input#register-password').val("");
    $('input#register-confirm-password').val("");
    $('div#register-modal span.modal-form-error').text("");
  }
});
$('div#register-modal form').submit(function(event) {
  event.preventDefault();
  var password = $('input#register-password').val();
  if (password.trim() === '') {
    $('input#register-password').val("");
    $('input#register-confirm-password').val("");
    $('input#register-password').focus();
    $('div#register-modal span.modal-form-error')
      .text("empty password");
    return;
  }
  var confirm_password = $('input#register-confirm-password').val();
  if (password !== confirm_password) {
    $('input#register-password').val("");
    $('input#register-confirm-password').val("");
    $('input#register-password').focus();
    $('div#register-modal span.modal-form-error')
      .text("passwords don't match");
    return;
  }
  var username = $('input#register-username').val();
  var valid_username_regex = /^[a-zA-Z0-9-_]+$/;
  if (username.search(valid_username_regex) === -1) {
    $('input#register-username').val("");
    $('input#register-username').focus();
    $('div#register-modal span.modal-form-error')
      .text("alphanumeric usernames only");
    return;
  }
  var email_field = $('input#register-email').val();
  var valid_email_regex = new RegExp(
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+/.source +
    /@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?/.source +
    /(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.source
  );
  if (email_field.search(valid_email_regex) === -1) {
    $('input#register-email').val("");
    $('input#register-email').focus();
    $('div#register-modal span.modal-form-error')
      .text("invalid email address");
    return;
  }
  $('div#register-modal input').prop("disabled", true);
  $.post(
    'register.php',
    {
      'username': username,
      'email': email_field,
      'password': password,
    },
    function(data) {
      console.log(data);
      if (data.success === true) {
        window.location.href = this_url+"&show=verify_email";
        return;
      }
      $('div#register-modal input').prop("disabled", false);
      if (data.error === 'username_taken') {
        $('input#register-username').val("");
        $('input#register-username').focus();
        $('div#register-modal span.modal-form-error')
          .text("username already taken");
      } else if (data.error === 'email_taken') {
        $('input#register-email').val("");
        $('input#register-email').focus();
        $('div#register-modal span.modal-form-error')
          .text("email already taken");
      } else {
        $('input#register-username').val("");
        $('input#register-email').val("");
        $('input#register-password').val("");
        $('input#register-confirm-password').val("");
        $('input#register-username').focus();
        $('div#register-modal span.modal-form-error')
          .text("unknown error");
      }
    }
  );
});

$('a#forgot-password-button').click(function() {
  $('div#log-in-modal-overlay').hide();
  $('input#log-in-password').val("");
  $('div#log-in-modal span.modal-form-error').text("");
  $('div#forgot-password-modal-overlay').show();
  $('input#forgot-password-username').focus();
});
$('div#log-in-modal span.modal-close').click(function() {
  $('div#forgot-password-modal span.modal-form-error').text("");
});
$(window).click(function(event) {
  if (event.target.id === 'log-in-modal-overlay') {
    $('div#forgot-password-modal span.modal-form-error').text("");
  }
});
$(document).keyup(function(e) {
  if (e.keyCode == 27) { // esc key
    $('div#forgot-password-modal span.modal-form-error').text("");
  }
});
$('div#forgot-password-modal form').submit(function(event) {
  event.preventDefault();
  var username = $('input#forgot-password-username').val();
  var valid_username_regex = /^[a-zA-Z0-9-_]+$/;
  var valid_email_regex = new RegExp(
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+/.source +
    /@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?/.source +
    /(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.source
  );
  if (
    username.search(valid_username_regex) === -1 &&
    username.search(valid_email_regex) === -1
  ) {
    $('input#forgot-password-username').val("");
    $('input#forgot-password-username').focus();
    $('div#forgot-password-modal span.modal-form-error')
      .text("alphanumeric usernames or emails only");
    return;
  }
  $('div#forgot-password-modal input').prop("disabled", true);
  $.post(
    'forgot_password.php',
    {
      'username': username,
    },
    function(data) {
      console.log(data);
      $('div#forgot-password-modal input').prop("disabled", false);
      $('input#forgot-password-username').val("");
      if (data.success === true) {
        $('div#forgot-password-modal-overlay').hide();
        $('div#forgot-password-modal span.modal-form-error').text("");
        $('div#password-reset-email-modal-overlay').show();
      } else if (data.error === 'invalid_user') {
        $('input#forgot-password-username').focus();
        $('div#forgot-password-modal span.modal-form-error')
          .text("user doesn't exist");
      } else {
        $('input#forgot-password-username').focus();
        $('div#forgot-password-modal span.modal-form-error')
          .text("unknown error");
      }
    }
  );
});
$('div#reset-password-modal form').submit(function(event) {
  event.preventDefault();
  var password = $('input#reset-new-password').val();
  if (password.trim() === '') {
    $('input#reset-new-password').val("");
    $('input#reset-confirm-password').val("");
    $('input#reset-new-password').focus();
    $('div#reset-password-modal span.modal-form-error')
      .text("empty password");
    return;
  }
  var confirm_password = $('input#reset-confirm-password').val();
  if (password !== confirm_password) {
    $('input#reset-new-password').val("");
    $('input#reset-confirm-password').val("");
    $('input#reset-new-password').focus();
    $('div#reset-password-modal span.modal-form-error')
      .text("passwords don't match");
    return;
  }
  $('div#reset-password-modal input').prop("disabled", true);
  $.post(
    'reset_password.php',
    {
      'code': $('input#reset-password-code').val(),
      'password': password,
    },
    function(data) {
      console.log(data);
      if (data.success === true) {
        window.location.href = this_url;
        return;
      }
      $('div#reset-password-modal input').prop("disabled", false);
      $('input#reset-new-password').val("");
      $('input#reset-confirm-password').val("");
      $('input#reset-new-password').focus();
      $('div#reset-password-modal span.modal-form-error')
        .text("unknown error");
    }
  );
});

$('a#log-out-button').click(function() {
  $.post(
    'logout.php',
    {},
    function(data) {
      window.location.href = month_url;
    }
  );
});

$('a#user-settings-button').click(function() {
  $('div#user-settings-modal-overlay').show();
  $('input#change-email').focus();
});
$('div#user-settings-modal span.modal-close').click(function() {
  $('input#change-current-password').val("");
  $('input#change-new-password').val("");
  $('input#change-confirm-password').val("");
  $('div#user-settings-modal span.modal-form-error').text("");
});
$(window).click(function(event) {
  if (event.target.id === 'user-settings-modal-overlay') {
    $('input#change-current-password').val("");
    $('input#change-new-password').val("");
    $('input#change-confirm-password').val("");
    $('div#user-settings-modal span.modal-form-error').text("");
  }
});
$(document).keyup(function(e) {
  if (e.keyCode == 27) { // esc key
    $('input#change-current-password').val("");
    $('input#change-new-password').val("");
    $('input#change-confirm-password').val("");
    $('div#user-settings-modal span.modal-form-error').text("");
  }
});
$('div#user-settings-modal form').submit(function(event) {
  event.preventDefault();
  var new_password = $('input#change-new-password').val();
  var confirm_password = $('input#change-confirm-password').val();
  if (new_password !== confirm_password) {
    $('input#change-new-password').val("");
    $('input#change-confirm-password').val("");
    $('input#change-new-password').focus();
    $('div#user-settings-modal span.modal-form-error')
      .text("passwords don't match");
    return;
  }
  var email_field = $('input#change-email').val();
  var valid_email_regex = new RegExp(
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+/.source +
    /@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?/.source +
    /(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.source
  );
  if (email_field.search(valid_email_regex) === -1) {
    $('input#change-email').val(email);
    $('div#email-verified-status').show();
    $('input#change-email').focus();
    $('div#user-settings-modal span.modal-form-error')
      .text("invalid email address");
    return;
  }
  $('div#user-settings-modal input').prop("disabled", true);
  $.post(
    'edit_account.php',
    {
      'email': email_field,
      'new_password': new_password,
      'old_password': $('input#change-old-password').val(),
    },
    function(data) {
      console.log(data);
      if (data.success === true) {
        if (email_field !== email) {
          window.location.href = this_url+"&show=verify_email";
        } else {
          window.location.href = this_url;
        }
        return;
      }
      $('div#user-settings-modal input').prop("disabled", false);
      if (data.error === 'invalid_credentials') {
        $('input#change-old-password').val("");
        $('input#change-old-password').focus();
        $('div#user-settings-modal span.modal-form-error')
          .text("wrong current password");
      } else if (data.error === 'email_taken') {
        $('input#change-email').val(email);
        $('div#email-verified-status').show();
        $('input#change-email').focus();
        $('div#user-settings-modal span.modal-form-error')
          .text("email already taken");
      } else {
        $('input#change-old-password').val("");
        $('input#change-email').val(email);
        $('div#email-verified-status').show();
        $('input#change-new-password').val("");
        $('input#change-confirm-password').val("");
        $('input#change-email').focus();
        $('div#user-settings-modal span.modal-form-error')
          .text("unknown error");
      }
    }
  );
});
$('input#change-email').on("input propertychange", function() {
  var email_field = $('input#change-email').val();
  if (email_field != email) {
    $('div#email-verified-status').hide();
  } else {
    $('div#email-verified-status').show();
  }
});
$('a#resend-verification-email-button').click(function() {
  // Close user settings modal
  $('input#change-current-password').val("");
  $('input#change-new-password').val("");
  $('input#change-confirm-password').val("");
  $('div#user-settings-modal span.modal-form-error').text("");
  $('div#user-settings-modal-overlay').hide();
  // Actually resend the email
  $.post('resend_verification.php', {});
  // Show verification modal
  $('div#verify-email-modal-overlay').show();
});

$('a#delete-account-button').click(function() {
  $('div#delete-account-modal-overlay').show();
  $('div#delete-account-modal input:visible')
    .filter(function() { return this.value === ""; })
    .first()
    .focus();
});
$('div#delete-account-modal span.modal-close').click(function() {
  $('input#delete-account-password').val("");
  $('div#delete-account-modal span.modal-form-error').text("");
});
$(window).click(function(event) {
  if (event.target.id === 'delete-account-modal-overlay') {
    $('input#delete-account-password').val("");
    $('div#delete-account-modal span.modal-form-error').text("");
  }
});
$(document).keyup(function(e) {
  if (e.keyCode == 27) { // esc key
    $('input#delete-account-password').val("");
    $('div#delete-account-modal span.modal-form-error').text("");
  }
});
$('div#delete-account-modal form').submit(function(event) {
  event.preventDefault();
  $('div#delete-account-modal input').prop("disabled", true);
  $.post(
    'delete_account.php',
    {
      'password': $('input#delete-account-password').val(),
    },
    function(data) {
      console.log(data);
      if (data.success === true) {
        window.location.href = month_url;
        return;
      }
      $('div#delete-account-modal input').prop("disabled", false);
      $('input#delete-account-password').val("");
      $('input#delete-account-password').focus();
      if (data.error === 'invalid_credentials') {
        $('div#delete-account-modal span.modal-form-error')
          .text("wrong password");
      } else {
        $('div#delete-account-modal span.modal-form-error')
          .text("unknown error");
      }
    }
  );
});

$('a#delete-squad-button').click(function() {
  $('div#delete-squad-modal-overlay').show();
  $('div#delete-squad-modal input:visible')
    .filter(function() { return this.value === ""; })
    .first()
    .focus();
});
$('div#delete-squad-modal span.modal-close').click(function() {
  $('input#delete-squad-password').val("");
  $('div#delete-squad-modal span.modal-form-error').text("");
});
$(window).click(function(event) {
  if (event.target.id === 'delete-squad-modal-overlay') {
    $('input#delete-squad-password').val("");
    $('div#delete-squad-modal span.modal-form-error').text("");
  }
});
$(document).keyup(function(e) {
  if (e.keyCode == 27) { // esc key
    $('input#delete-squad-password').val("");
    $('div#delete-squad-modal span.modal-form-error').text("");
  }
});
$('div#delete-squad-modal form').submit(function(event) {
  event.preventDefault();
  $('div#delete-squad-modal input').prop("disabled", true);
  $.post(
    'delete_squad.php',
    {
      'squad': squad,
      'password': $('input#delete-squad-password').val(),
    },
    function(data) {
      console.log(data);
      if (data.success === true) {
        window.location.href = month_url;
        return;
      }
      $('div#delete-squad-modal input').prop("disabled", false);
      $('input#delete-squad-password').val("");
      $('input#delete-squad-password').focus();
      if (data.error === 'invalid_credentials') {
        $('div#delete-squad-modal span.modal-form-error')
          .text("wrong password");
      } else {
        $('div#delete-squad-modal span.modal-form-error')
          .text("unknown error");
      }
    }
  );
});

$('input#edit-squad-closed').click(function() {
  $('div#edit-squad-new-password-container').show();
  $('div#edit-squad-confirm-password-container').show();
});
$('input#edit-squad-open').click(function() {
  $('div#edit-squad-new-password-container').hide();
  $('div#edit-squad-confirm-password-container').hide();
});
$('a#edit-squad-button').click(function() {
  $('div#edit-squad-modal-overlay').show();
  $('input#edit-squad-name').focus();
});
$('div#edit-squad-modal span.modal-close').click(function() {
  $('input#edit-squad-personal-password').val("");
  $('input#edit-squad-new-password').val("");
  $('input#edit-squad-confirm-password').val("");
  $('div#edit-squad-modal span.modal-form-error').text("");
});
$(window).click(function(event) {
  if (event.target.id === 'edit-squad-modal-overlay') {
    $('input#edit-squad-personal-password').val("");
    $('input#edit-squad-new-password').val("");
    $('input#edit-squad-confirm-password').val("");
    $('div#edit-squad-modal span.modal-form-error').text("");
  }
});
$(document).keyup(function(e) {
  if (e.keyCode == 27) { // esc key
    $('input#edit-squad-personal-password').val("");
    $('input#edit-squad-new-password').val("");
    $('input#edit-squad-confirm-password').val("");
    $('div#edit-squad-modal span.modal-form-error').text("");
  }
});
$('div#edit-squad-modal form').submit(function(event) {
  event.preventDefault();
  var name = $('input#edit-squad-name').val().trim();
  if (name === '') {
    $('input#edit-squad-name').val(squad_name);
    $('input#edit-squad-name').focus();
    $('div#edit-squad-modal span.modal-form-error')
      .text("empty squad name");
    return;
  }
  var type = $('div#edit-squad-modal '+
    'input[name="edit-squad-type"]:checked');
  if (type.length === 0) {
    $('input#edit-squad-open').focus();
    $('div#edit-squad-modal span.modal-form-error')
      .text("squad type unspecified");
    return;
  }
  var new_password = $('input#edit-squad-new-password').val();
  if (type.val() === 'closed') {
    if (!squad_requires_auth) {
      // If the squad is currently open but is being switched to closed,
      // then a password *must* be specified
      if (new_password.trim() === '') {
        $('input#edit-squad-new-password').val("");
        $('input#edit-squad-confirm-password').val("");
        $('input#edit-squad-new-password').focus();
        $('div#edit-squad-modal span.modal-form-error')
          .text("empty password");
        return;
      }
    }
    var confirm_password = $('input#edit-squad-confirm-password').val();
    if (new_password !== confirm_password) {
      $('input#edit-squad-new-password').val("");
      $('input#edit-squad-confirm-password').val("");
      $('input#edit-squad-new-password').focus();
      $('div#edit-squad-modal span.modal-form-error')
        .text("passwords don't match");
      return;
    }
  }
  $('div#edit-squad-modal input').prop("disabled", true);
  $.post(
    'edit_squad.php',
    {
      'name': name,
      'squad': squad,
      'type': type.val(),
      'personal_password': $('input#edit-squad-personal-password').val(),
      'new_password': new_password,
    },
    function(data) {
      console.log(data);
      if (data.success === true) {
        window.location.href = this_url;
        return;
      }
      $('div#edit-squad-modal input').prop("disabled", false);
      if (data.error === 'invalid_credentials') {
        $('input#edit-squad-personal-password').val("");
        $('input#edit-squad-personal-password').focus();
        $('div#edit-squad-modal span.modal-form-error')
          .text("wrong password");
      } else if (data.error === 'name_taken') {
        $('input#edit-squad-name').val(squad_name);
        $('input#edit-squad-name').focus();
        $('div#edit-squad-modal span.modal-form-error')
          .text("squad name already taken");
      } else {
        $('input#edit-squad-name').val(squad_name);
        if (squad_requires_auth) {
          $('div#edit-squad-new-password-container').show();
          $('div#edit-squad-confirm-password-container').show();
        } else {
          $('div#edit-squad-new-password-container').hide();
          $('div#edit-squad-confirm-password-container').hide();
        }
        $('input#edit-squad-open').prop('checked', !squad_requires_auth);
        $('input#edit-squad-closed').prop('checked', squad_requires_auth);
        $('input#edit-squad-new-password').val("");
        $('input#edit-squad-confirm-password').val("");
        $('input#edit-squad-personal-password').val("");
        $('input#edit-squad-name').focus();
        $('div#edit-squad-modal span.modal-form-error')
          .text("unknown error");
      }
    }
  );
});

$('a.show-login-modal').click(function() {
  $('select#squad-nav').val(squad);
  $('div.modal-overlay').hide();
  $('div#log-in-modal-overlay').show();
  $('div#log-in-modal input:visible')
    .filter(function() { return this.value === ""; })
    .first()
    .focus();
});
$('a.show-register-modal').click(function() {
  $('select#squad-nav').val(squad);
  $('div.modal-overlay').hide();
  $('div#register-modal-overlay').show();
  $('div#register-modal input:visible')
    .filter(function() { return this.value === ""; })
    .first()
    .focus();
});

$('td.day > div').click(function(event) {
  var container = $(event.target);
  if (container.hasClass('entry-container-spacer')) {
    container = container.parent();
  }
  if (container.hasClass('day-action-links')) {
    container = container.parent().find('div.entry-container');
  }
  if (!container.hasClass('entry-container')) {
    return;
  }
  var textarea_id = container.closest('td.day').attr('id') + '_-1';
  if ($('textarea#' + textarea_id).length !== 0) {
    return;
  }
  var new_entry = $("<div class='entry' />");
  var textarea = $("<textarea rows='1' />");
  textarea.attr('id', textarea_id);
  new_entry.append(textarea);
  new_entry.append(
    "<div class='action-links'>" +
    "  <a href='#' class='delete-entry-button'>" +
    "    <span class='delete'>✖</span>" +
    "    <span class='action-links-text'>Delete</span>" +
    "  </a>" +
    "</div>"
  );
  container.find('div.entry-container-spacer').before(new_entry);
  $('textarea#' + textarea_id).focus();
  container.scrollTop(container[0].scrollHeight);
  $('textarea').each(function (i) { $(this).attr('tabindex', i + 1); });
});

function delete_entry(textarea_id) {
  var id_parts = textarea_id.split("_");
  if (id_parts[1] !== "-1") {
    $.post(
      'delete_entry.php',
      { 'id': id_parts[1] },
      function(data) {
        console.log(data);
      }
    );
  } else if (creating[id_parts[0]]) {
    needs_update_after_creation[id_parts[0]] = true;
  }
  $('textarea#' + textarea_id).closest('div.entry').remove();
}
$('table').on('focusout', 'textarea', function(event) {
  if (event.target.value.trim() === '') {
    delete_entry(event.target.id);
  }
});
$('table').on('click', 'a.delete-entry-button', function() {
  var entry = $(this).closest('div.entry');
  var next_entry = entry.next('div.entry');
  var textarea_id = entry.find('textarea').attr('id');
  delete_entry(textarea_id);
  next_entry.addClass('focused-entry');
  next_entry.find('div.action-links').addClass('focused-action-links');
});

function update_entry_focus(entry) {
  var textarea = entry.find('textarea');
  var action_links = entry.find('div.action-links');
  if (entry.is(':hover') || textarea.is(':focus')) {
    entry.addClass('focused-entry');
    action_links.addClass('focused-action-links');
  } else {
    entry.removeClass('focused-entry');
    action_links.removeClass('focused-action-links');
  }
}
$('table').on('focusin focusout', 'textarea', function(event) {
  var entry = $(event.target).closest('div.entry');
  update_entry_focus(entry);
});
$('table').on('mouseenter mouseleave', 'div.entry', function(event) {
  var entry = $(event.target).closest('div.entry');
  update_entry_focus(entry);
});
$('td.day').hover(function(event) {
  var day = $(event.target).closest('td.day');
  if (day.is(':hover')) {
    day.find('div.day-action-links').addClass('focused-action-links');
    day.find('div.entry-container').addClass('focused-entry-container');
  } else {
    day.find('div.day-action-links').removeClass('focused-action-links');
    day.find('div.entry-container').removeClass('focused-entry-container');
  }
});

var history_numeric_date = null;
var day_history_loaded = false;
var entry_history_loaded = null;
// mode = 0: day view
// mode = 1: entry view
function update_history_modal_mode(mode, animate) {
  $('div#history-modal-overlay').show();
  if (mode === 0) {
    if (animate) {
      $('div.day-history').animate({
        left: '0',
      }, 500);
      $('div.entry-history').animate({
        left: '100%',
      }, 500);
    } else {
      $('div.day-history').css('left', '0');
      $('div.entry-history').css('left', '100%');
    }
    $('a#all-history-button').css('visibility', 'hidden');
  } else if (mode === 1) {
    if (animate) {
      $('div.day-history').animate({
        left: '-100%',
      }, 500);
      $('div.entry-history').animate({
        left: '0',
      }, 500);
    } else {
      $('div.day-history').css('left', '-100%');
      $('div.entry-history').css('left', '0');
    }
    $('a#all-history-button').css('visibility', 'visible');
  }
}
function show_entry_history(id, animate) {
  $('p#history-loading').show();
  $('div.entry-history > ul').empty();
  $('span.history-date').text(pretty_date(history_numeric_date));
  update_history_modal_mode(1, animate);
  $.post(
    'entry_history.php',
    { 'id': id },
    function(data) {
      console.log(data);
      $('p#history-loading').hide();
      var list = $('div.entry-history > ul');
      for (var i in data.result) {
        var revision = data.result[i];
        var list_item = $('<li>').appendTo(list);
        list_item.append(
          "<div class='entry entry-history-entry'>" +
            revision.text + "</div>"
        );
        var author = revision.author === null
          ? "Anonymous"
          : "<span class='entry-username'>" + revision.author + "</span>";
        list_item.append(
          "<span class='entry-author'>updated by " + author + "</span>"
        );
        var date = new Date(revision.last_update);
        var hovertext =
          $.format.toBrowserTimeZone(date, "ddd, MMMM D, yyyy 'at' h:mm a");
        var time = $(
          "<time class='timeago entry-time' datetime='" + date.toISOString() +
            "'>" + hovertext + "</time>"
        ).appendTo(list_item);
        time.timeago();
        list_item.append("<div class='clear'>");
      }
      entry_history_loaded = id;
    }
  );
}
function show_day_history(numeric_date, animate) {
  $('p#history-loading').show();
  $('div.day-history > ul').empty();
  $('span.history-date').text(pretty_date(history_numeric_date));
  update_history_modal_mode(0, animate);
  $.post(
    'day_history.php',
    {
      'day': numeric_date,
      'month': month,
      'year': year,
      'squad': squad,
    },
    function(data) {
      console.log(data);
      $('p#history-loading').hide();
      var list = $('div.day-history > ul');
      for (var i in data.result) {
        var entry = data.result[i];
        var list_item = $("<li id='history_" + entry.id + "'>").appendTo(list);
        list_item.append(
          "<div class='entry entry-history-entry'>" +
            entry.text + "</div>"
        );
        var creator = entry.creator === null
          ? "Anonymous"
          : "<span class='entry-username'>" + entry.creator + "</span>";
        list_item.append(
          "<span class='entry-author'>created by " + creator + "</span>"
        );
        var date = new Date(entry.creation_time);
        var hovertext =
          $.format.toBrowserTimeZone(date, "ddd, MMMM D, yyyy 'at' h:mm a");
        var time = $(
          "<time class='timeago entry-time' datetime='" + date.toISOString() +
            "'>" + hovertext + "</time>"
        ).appendTo(list_item);
        time.timeago();
        list_item.append("<div class='clear'>");
        var deleted = entry.deleted
          ? "<span class='deleted-entry-label'>deleted</span>"
          : "";
        list_item.append(deleted);
        list_item.append(
          "<a href='#' class='revision-history-button'>" +
            "revision history &gt;</a>"
        );
        list_item.append("<div class='clear'>");
      }
      day_history_loaded = true;
    }
  );
}
function pretty_date(numeric_date) {
  var month_and_date = $('h2.upper-center').text().replace(/[<>]/g, '').trim();
  var date = new Date(month_and_date + " " + numeric_date);
  return $.format.date(date, "MMMM D, yyyy");
}

$('table').on('click', 'a.entry-history-button', function() {
  var entry = $(this).closest('div.entry');
  entry.removeClass('focused-entry');
  var id_parts = entry.find('textarea').attr('id').split('_');
  if (history_numeric_date != id_parts[0]) {
    history_numeric_date = id_parts[0];
    day_history_loaded = false;
  }
  if (entry_history_loaded === id_parts[1]) {
    update_history_modal_mode(1, false);
  } else {
    show_entry_history(id_parts[1], false);
  }
});
$('div.day-history').on('click', 'a.revision-history-button', function() {
  var id_parts = $(this).closest('li').attr('id').split('_');
  if (entry_history_loaded === id_parts[1]) {
    update_history_modal_mode(1, true);
  } else {
    show_entry_history(id_parts[1], true);
  }
});
$('a.day-history-button').click(function() {
  var new_numeric_date = $(this).closest('td.day').attr('id');
  if (new_numeric_date === history_numeric_date && day_history_loaded) {
    update_history_modal_mode(0, false);
  } else {
    history_numeric_date = new_numeric_date;
    show_day_history(history_numeric_date, false);
  }
});
$('a#all-history-button').click(function() {
  if (!history_numeric_date) {
    return;
  }
  if (day_history_loaded) {
    update_history_modal_mode(0, true);
  } else {
    show_day_history(history_numeric_date, true);
  }
});
