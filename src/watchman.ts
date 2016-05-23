export default class Watchman {
  private _config;
  private _client;
  private _terminal;
  private _sync;
  
  constructor(config, watchmanClient, terminal, sync) {
    this._config = config;
    this._client = watchmanClient;
    this._terminal = terminal;
    this._sync = sync;
  }
  
  start() {
    const capabilities = {
      optional: [], 
      required: ['relative_root']
    };
    const onCapabilityCheck = this._onCapabilityCheck.bind(this)
    
    this._terminal.start();
    this._client.capabilityCheck(capabilities, onCapabilityCheck);
  }
  
  private _onCapabilityCheck(error) {
    var terminal = this._terminal;
    if (error) {
      terminal.error(error);
      return;
    }
    terminal.render();

    var promises = [], subscriptions = Object.keys(this._config.subscriptions);
    for (var i = 0; i < subscriptions.length; i++) {
      var name = subscriptions[i],
        subscription = this._config.subscriptions[name];

      promises.push(this._subscribe(subscription.source, name, null, subscription.watchExpression));
    }
    Promise.all(promises).then(this._terminal.render);

    // subscription is fired regardless of which subscriber fired it
    this._client.on('subscription', this._onSubscription.bind(this));
  }
  
  private _onSubscription(resp) {
    const config = this._config;
    const terminal = this._terminal;
    const subscription = (resp && resp.subscription) || '';
    const files = resp.files;

    const subConfig = config.subscriptions[subscription];
    terminal.setState(subConfig, 'running');
    if (subConfig) {
      if (subConfig.type === 'rsync') {
        this._sync.syncFiles(subConfig, subConfig.source, subConfig.destination, files)
          .then((output) => {
            terminal.debug(output);
            terminal.setState(subConfig, 'good', output);
          })
          .catch((err) => {
            terminal.debug(err);
            terminal.setState(subConfig, 'error', err);
          });
      }
    }
  }
  
  private _subscribe(folder, name, relativePath, expression) {
    var terminal = this._terminal;
    var client = this._client;
    if (typeof expression === 'undefined') {
      expression = ['allof', ['type', 'f']];
    }
    var sub = {
      expression: expression,
      fields: ['name', 'exists'],
      relative_root: ''
    };
    if (relativePath) {
      sub.relative_root = relativePath;
    }

    terminal.debug('starting:' + name + ' expression: ' + JSON.stringify(expression));
    return new Promise(function (resolve, reject) {
      client.command(['subscribe', folder, name, sub],
        function (error) {
          if (error) {
            reject('failed to subscribe: ' + error);
          }
          resolve();
        });
    });
  }
  
}
