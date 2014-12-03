var util = require('util')
var WalletCore = require('cc-wallet-core');
var OperationalTx = WalletCore.tx.OperationalTx;
var ColorValue = WalletCore.cclib.ColorValue;
var UncoloredColorDefinition = WalletCore.cclib.UncoloredColorDefinition
var Set = require('set')
var bitcoin = require('./bitcoin')

/**
 * @class OperationalETxSpec
 */
function OperationalETxSpec(wallet, ewctrl){
  OperationalTx.call(this)
  this.wallet = wallet
  this.ewctrl = ewctrl
  this.our_value_limit = undefined
}

util.inherits(OperationalETxSpec, OperationalTx);

OperationalETxSpec.prototype.get_targets = function(){
  return OperationalTx.prototype.getTargets.call(this)
}

OperationalETxSpec.prototype.getChangeAddress = function(colordef) {
  var seedHex = ewctrl.getSeedHex()
  return this.wallet.getNewAddress(seedHex, colordef)
}

OperationalETxSpec.prototype.get_change_address = function(colordef){
  return this.getChangeAddress(colordef)
}

OperationalETxSpec.prototype.set_our_value_limit = function(our){
  our_colordef = this.ewctrl.resolve_color_spec(our['color_spec'])
  this.our_value_limit = new ColorValue(our_colordef, our['value'])
}

OperationalETxSpec.prototype.prepare_inputs = function(etx_spec){
  this.inputs = {}
  for (var color_spec in etx_spec.inputs) {
    var inps = etx_spec.inputs[key]
    var colordef = this.ewctrl.resolve_color_spec(color_spec)
    var color_id_set = new Set([colordef.get_color_id()])
    for(i = 0; i < inps.length; i++){
      var inp = inps[i]
      var txhash = inp[0]
      var outindex = inp[1]
      var tx = this.ewctrl.wallet.txDb.getTx(txhash)
      var prevout = tx.outs[outindex]
      var utxo = {
        "txhash": txhash,
        "outindex": outindex,
        "value": prevout.value,
        "script": prevout.script
      }
      var colorvalue = null
      if(colordef.getColorType() === "uncolored"){
        colorvalue = new ColorValue({colordef: colordef, value: prevout.value})
      } else {
        var colordata = this.ewctrl.wallet.getColorData()
        colordata.getColorValue(txhash, outindex, colordef, function(e, cv{
          colorvalue = cv
        })
      }
      if(colorvalue){
        if(!this.inputs[colordef.getColorId()){
          this.inputs[colordef.getColorId()] = []
        }
        this.inputs[colordef.getColorId()].push([colorvalue, utxo])
      }
    }
  }
}

OperationalETxSpec.prototype.prepare_targets = function(etx_spec, their){
  this.targets = []
  for(i = 0; i < etx_spec.targets.length; i++){
    var address = etx_spec.targets[i][0]
    var color_spec = etx_spec.targets[i][0]
    var value = etx_spec.targets[i][0]
    var colordef = this.ewctrl.resolve_color_spec(color_spec)
    var colorvalue = new ColorValue({colordef: colordef, value: value})
    var targetScript = bitcoin.Address.fromBase58Check(address).toOutputScript()
    this.targets.push(new ColorTarget(targetScript.toHex(), colorvalue))
  }
  var wam = this.ewctrl.wallet.aManager
  var their_colordef = this.ewctrl.resolve_color_spec(their['color_spec'])
  var address = this.getChangeAddress(colordef)
  var targetScript = bitcoin.Address.fromBase58Check(address).toOutputScript()
  var cv = new ColorValue({colordef: their_colordef, value: their['value']})
  this.targets.push(new ColorTarget(targetScript.toHex(), cv))
}

OperationalETxSpec.prototype.select_uncolored_coins = function(
      colorvalue, feeEstimator
    ){
  var zero = new ColorValue({ 
    colordef: new UncoloredColorDefinition(), value: 0
  })
  var selected_inputs = []
  var selected_value = zero.clone()
  var needed = zero.clone()
  if(feeEstimator){
    needed = colorvalue.plus(feeEstimator.estimate_required_fee())
  } else {
    needed = colorvalue
  }
  var color_id = 0
  if(color_id in this.inputs){
    var inputs = this.inputs[color_id]
    var total = zero.clone()
    for(i=0; i < inputs.length; i++){
      total = total.plus(inputs[i][0])
    }
    needed = needed.minus(total)
    for(i=0; i < inputs.length; i++){
      selected_inputs.push(inputs[i][1])
    }
    selected_value = selected_value.plus(total)
  }
  if(needed.getValue() > 0){
    var value_limit = new ColorValue({ 
      colordef: new UncoloredColorDefinition(), value: 10000+8192*2
    })
    if(this.our_value_limit.isUncolored()){
      value_limit = value_limit.plus(this.our_value_limit)
    }
    if(needed.getValue() > value_limit.getValue()){
      throw new Error(
          "Insufficient Funds, exceeded limits: " + needed + 
          " requested, " + value_limit + " found" % (needed, value_limit)
      )
    }
    OperationalTx.prototype.selectCoins.call(
        this, colorvalue.minus(selected_value), feeEstimator,
        function (err, coins, value){
          selected_value = selected_value.plus(value)
          for(i=0; i < coins.length; i++){
            selected_inputs.push(coins[i])
          }
        }
    )
  }
  return [selected_inputs, selected_value]
}

OperationalETxSpec.prototype.select_coins = function(colorvalue, feeEstimator){
  var result = []
  var error = undefined
  var cb = function(err, coins, value){
    result.push(coins)
    result.push(value)
    error = err
  }
  OperationalETxSpec.prototype.selectCoins.call(
      self, colorvalue, feeEstimator, cb
  )
  if(error){
    throw new Error(error)
  }
  return result
}

OperationalETxSpec.prototype.selectCoins = function(colorValue, feeEstimator, cb){
  //self._validate_select_coins_parameters(colorValue, feeEstimator)
  colordef = colorValue.getColorDefinition()
  if(colordef.getColorType() === "uncolored"){
    var data = this.select_uncolored_coins(colorValue, feeEstimator)
    cb(null, data[0], data[1])
    return undefined
  }
  color_id = colordef.getColorId()
  if(color_id in this.inputs){
    var inputs = this.inputs[color_id]
    var total = zero.clone()
    for(i=0; i < inputs.length; i++){
      total = total.plus(inputs[i][0])
    }
    if(total.getValue() < colorValue.getValue()){
      var err = (
          "Insufficient funds, not enough coins: " + colorValue + 
          " requested, " + total + " found"
      )
      cb(err, undefined, undefined)
      return undefined
    }

    var coins = []
    for(i=0; i < inputs.length; i++){
      coins.push(inputs[i][1])
    }
    cb(null, coins, total)
    return undefined
  }
  if(colorValue.getValue() > this.our_value_limit.getValue()){
    var err = (
        "Insufficient funds " + colorValue + " requested, " + 
        this.our_value_limit + " found"
    )
    cb(err, undefined, undefined)
    return undefined
  }
  OperationalTx.prototype.selectCoins(this, colorValue, feeEstimator, cb)
}

/**
 * @class EWalletController
 */
function EWalletController(wallet, seedHex){
  this.wallet = wallet
  this.seedHex = seedHex
}

EWalletController.prototype.publish_tx = function(raw_tx, my_offer){
  // TODO implement
  throw new Error("Not implemented!")
}

EWalletController.prototype.check_tx = function(raw_tx, etx_spec){
  // TODO implement
  throw new Error("Not implemented!")
}

EWalletController.prototype.resolve_color_spec = function(color_spec){
  // TODO implement
  throw new Error("Not implemented!")
}

EWalletController.prototype.offer_side_to_colorvalue = function(side){
  // TODO implement
  throw new Error("Not implemented!")
}

EWalletController.prototype.select_inputs = function(colorvalue){
  // TODO implement
  throw new Error("Not implemented!")
}

EWalletController.prototype.make_etx_spec = function(our, their){
  // TODO implement
  throw new Error("Not implemented!")
}

EWalletController.prototype.make_reply_tx = function(etx_spec, our, their){
  // TODO implement
  throw new Error("Not implemented!")
}

EWalletController.prototype.getSeedHex = function(){
  return this.seedHex
}


module.exports = {
  OperationalETxSpec: OperationalETxSpec,
  EWalletController: EWalletController
}

