import React from 'react';
import { Button, Form, FormGroup, Label, Input } from 'reactstrap';
import uuidv4 from 'uuid/v4'

class BuyTradeForm extends React.Component {
  state = {
    trade_id: uuidv4().replace(/-/g, ''),
    buyer_steam_id: ''
  }

  onChange = e => {
    this.setState({[e.target.name]: e.target.value})
  }

  submitFormBuy = e => {
    e.preventDefault()
    fetch('http://localhost:3000/crud', {
      method: 'put',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        trade_id: this.state.trade_id,
        buyer_steam_id: this.state.buyer_steam_id
      })
    })
      .then(response => response.json())
      .then(trade => {
        if(Array.isArray(trade)) {
          // console.log(trade[0])
          this.props.updateState(trade[0])
          this.props.toggle()
        } else {
          console.log('failure')
        }
      })
      .catch(err => console.log(err))
  }

  componentDidMount(){
    // if trade exists, populate the state with proper data
    if(this.props.trade){
      const { trade_id, buyer_steam_id, app_id, assetid, classid, instanceid, inventoryContext, askingPrice } = this.props.trade
      this.setState({ trade_id, buyer_steam_id })
    }
  }

  renderBuyForm() {
    return (
      <Form onSubmit={this.submitFormBuy}>
        <FormGroup>
          <Label for="trade_id">Trade Id</Label>
          <Input type="text" name="trade_id" id="trade_id" onChange={this.onChange} value={this.state.trade_id} />
        </FormGroup>
        <FormGroup>
          <Label for="buyer_steam_id">Steam Id</Label>
          <Input type="text" name="buyer_steam_id" id="buyer_steam_id" onChange={this.onChange} value={this.state.buyer_steam_id}  />
        </FormGroup>
        <Button>Submit</Button>
      </Form>
    );
  }

  render() {
    return this.renderBuyForm
  }
}

export default BuyTradeForm
