var expect = require('chai').expect
var BIP39 = require('bip39')

var WalletEngine = require('../src/WalletEngine')
var AssetModel = require('../src/AssetModel')

describe('PaymentModel', function () {
  this.timeout(30 * 1000)

  var mnemonic = 'aerobic naive paper isolate volume coffee minimum crucial purse inmate winner cricket'
  var password = ''
  var seed = BIP39.mnemonicToSeedHex(mnemonic, password)

  var walletEngine
  var paymentModel

  before(function (done) {
    this.timeout(240 * 1000)

    global.localStorage.clear()
    walletEngine = new WalletEngine({
      testnet: true,
      blockchain: {name: 'Naive'},
      spendUnconfirmedCoins: true
    })
    walletEngine.getWallet().once('syncStop', done)
    walletEngine.getWallet().initialize(seed)
  })

  beforeEach(function (done) {
    this.timeout(20 * 1000)

    var assetdef = walletEngine.getWallet().getAssetDefinitionByMoniker('bitcoin')
    var assetModel = new AssetModel(walletEngine, assetdef)
    assetModel.on('error', function (error) { throw error })

    var cnt = 0
    assetModel.on('update', function () {
      if (++cnt === 1) {
        paymentModel = assetModel.makePayment()
        done()
      }
    })
  })

  after(function () {
    walletEngine.getWallet().getConnector().disconnect()
    walletEngine.removeListeners()
    walletEngine = null
    global.localStorage.clear()
  })

  afterEach(function () {
    paymentModel = null
  })

  it('checkAddress return true', function () {
    var isValid = paymentModel.checkAddress('n2f687HTAW5R8pg6DRVHn5AS1a2hAK5WgW')
    expect(isValid).to.be.true
  })

  it('checkAddress return false', function () {
    var isValid = paymentModel.checkAddress('n2f687HTAW5R8pg6DRVHn5AS1a2hAK5Wg')
    expect(isValid).to.be.false
  })

  // @todo Return false, because all coins unconfirmed (this paymentModel involved in send coins below)
  it.skip('checkAmount return true', function () {
    var isValid = paymentModel.checkAmount('0.001')
    expect(isValid).to.be.true
  })

  it('checkAmount return false', function () {
    var isValid = paymentModel.checkAmount('1')
    expect(isValid).to.be.false
  })

  it('addRecipient not throw error', function () {
    expect(function () {
      paymentModel.addRecipient('n2f687HTAW5R8pg6DRVHn5AS1a2hAK5WgW', '0.01')
    }).to.not.throw(Error)
  })

  it('addRecipient throw error', function () {
    paymentModel.readOnly = true
    expect(function () {
      paymentModel.addRecipient('n2f687HTAW5R8pg6DRVHn5AS1a2hAK5WgW', '0.01')
    }).to.throw(Error)
  })

  it('send', function (done) {
    paymentModel.addRecipient('n2f687HTAW5R8pg6DRVHn5AS1a2hAK5WgW', '0.001')
    paymentModel.setSeed(seed)
    paymentModel.send(function (err) {
      try {
        expect(err).to.be.null
        done()
      } catch (err) {
        done(err)
      }
    })
  })

  it('send throw error (payment already sent)', function () {
    paymentModel.readOnly = true
    expect(paymentModel.send.bind(paymentModel)).to.throw(Error)
  })

  it('send throw error (recipient is empty)', function () {
    expect(paymentModel.send.bind(paymentModel)).to.throw(Error)
  })

  it('send throw error (mnemonic not set)', function () {
    paymentModel.addRecipient('n2f687HTAW5R8pg6DRVHn5AS1a2hAK5WgW', '0.01')
    expect(paymentModel.send.bind(paymentModel)).to.throw(Error)
  })

  it('getStatus return fresh', function () {
    expect(paymentModel.getStatus()).to.equal('fresh')
  })
})
